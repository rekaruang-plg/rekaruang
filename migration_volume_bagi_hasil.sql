-- Reka Ruang | penambahan volume pekerjaan dan distribusi laba
-- Terapkan hanya pada project Supabase yang dipakai oleh rekaruang.vercel.app.
-- Tidak menghapus atau mengubah transaksi/proyek yang sudah ada.
-- WAJIB backup database dan verifikasi struktur tabel dahulu.

begin;

alter table public.projects
  add column if not exists finance_closed_at timestamptz,
  add column if not exists finance_close_income numeric(15,2),
  add column if not exists finance_close_expense numeric(15,2),
  add column if not exists finance_close_profit numeric(15,2);

create table if not exists public.project_work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  work_name text not null check (length(trim(work_name)) > 0),
  measurement_mode text not null default 'area'
    check (measurement_mode in ('area','kitchen_standard')),
  length_cm numeric(12,2) not null check (length_cm > 0),
  height_cm numeric(12,2) check (height_cm > 0),
  width_cm numeric(12,2) check (width_cm >= 0),
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  volume_value numeric(18,3) generated always as (
    round(
      (length_cm / 100) *
      (case when measurement_mode = 'kitchen_standard'
        then 1::numeric
        else height_cm / 100
      end) * quantity, 3
    )
  ) stored,
  constraint work_item_height_needed check (
    measurement_mode = 'kitchen_standard' or height_cm is not null
  ),
  constraint work_item_standard_only_kitchen check (
    measurement_mode <> 'kitchen_standard' or work_name in ('Kitchen Set Atas','Kitchen Set Bawah')
  )
);
create index if not exists project_work_items_project_idx
  on public.project_work_items(project_id);

create table if not exists public.profit_distributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_name text not null check (length(trim(recipient_name)) > 0),
  paid_date date not null,
  share_percent numeric(5,2) check (share_percent > 0 and share_percent <= 100),
  amount numeric(15,2) not null check (amount > 0),
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists profit_distributions_project_idx
  on public.profit_distributions(project_id);

-- Work items mengikuti akses ke baris proyek yang sudah ada,
-- bukan akses global untuk semua proyek dalam database.
alter table public.project_work_items enable row level security;
alter table public.profit_distributions enable row level security;

grant select, insert, update, delete on public.project_work_items to authenticated;
grant select, insert on public.profit_distributions to authenticated;
revoke update, delete on public.profit_distributions from authenticated;
revoke all on public.project_work_items, public.profit_distributions from anon;

create policy "rr_work_select" on public.project_work_items
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id=project_id)
  );
create policy "rr_work_insert" on public.project_work_items
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and exists (select 1 from public.projects p where p.id=project_id)
  );
create policy "rr_work_update" on public.project_work_items
  for update to authenticated
  using (exists (select 1 from public.projects p where p.id=project_id))
  with check (exists (select 1 from public.projects p where p.id=project_id));
create policy "rr_work_delete" on public.project_work_items
  for delete to authenticated
  using (exists (select 1 from public.projects p where p.id=project_id));

create policy "rr_profit_select" on public.profit_distributions
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id=project_id)
  );
create policy "rr_profit_insert" on public.profit_distributions
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and exists (select 1 from public.projects p where p.id=project_id)
  );

-- Tidak boleh memindah rincian ke proyek lain / mengganti nama pembuat.
create or replace function public.rr_protect_work_item()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.project_id is distinct from old.project_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Proyek dan pembuat rincian tidak dapat diganti';
  end if;
  return new;
end;
$$;
drop trigger if exists rr_protect_work_item on public.project_work_items;
create trigger rr_protect_work_item before update on public.project_work_items
  for each row execute function public.rr_protect_work_item();

-- Ketika keuangan ditutup, nilai snapshot wajib cocok dengan transaksi faktual.
-- Seluruh tagihan harus lunas dan proyek sudah berstatus Selesai.
create or replace function public.rr_validate_finance_close()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  actual_income numeric(15,2);
  actual_expense numeric(15,2);
begin
  if old.finance_closed_at is not null then
    if new.finance_closed_at is distinct from old.finance_closed_at
       or new.finance_close_income is distinct from old.finance_close_income
       or new.finance_close_expense is distinct from old.finance_close_expense
       or new.finance_close_profit is distinct from old.finance_close_profit
       or new.project_value is distinct from old.project_value
       or new.status is distinct from old.status then
      raise exception 'Keuangan sudah ditutup. Nilai kontrak, status dan angka final terkunci.';
    end if;
    return new;
  end if;

  if new.finance_closed_at is not null then
    if new.status <> 'Selesai' then
      raise exception 'Proyek harus Selesai sebelum keuangan ditutup';
    end if;

    select
      coalesce(sum(amount) filter (where type='income'),0),
      coalesce(sum(amount) filter (where type='expense'),0)
    into actual_income,actual_expense
    from public.transactions
    where project_id=new.id;

    if actual_income < coalesce(new.project_value,0) then
      raise exception 'Tagihan proyek belum lunas; keuangan tidak bisa ditutup';
    end if;
    if new.finance_close_income is distinct from actual_income
       or new.finance_close_expense is distinct from actual_expense
       or new.finance_close_profit is distinct from (actual_income-actual_expense) then
      raise exception 'Angka tutup keuangan tidak cocok dengan transaksi aktual';
    end if;
  elsif new.finance_close_income is not null or
        new.finance_close_expense is not null or
        new.finance_close_profit is not null then
    raise exception 'Angka final hanya dapat diisi saat tutup keuangan';
  end if;
  return new;
end;
$$;
drop trigger if exists rr_validate_finance_close on public.projects;
create trigger rr_validate_finance_close before update on public.projects
  for each row execute function public.rr_validate_finance_close();

-- Setelah penutupan keuangan, tidak ada transaksi operasional tambahan,
-- pemindahan transaksi, perubahan ataupun penghapusan transaksi.
create or replace function public.rr_guard_transaction_when_closed()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  closed_at timestamptz;
begin
  -- FOR UPDATE membuat pencatatan transaksi dan tutup keuangan saling menunggu,
  -- sehingga tidak ada transaksi baru yang lolos setelah snapshot diambil.
  select finance_closed_at into closed_at
  from public.projects
  where id=(case when tg_op='INSERT' then new.project_id else old.project_id end)
  for update;
  if closed_at is not null then
    raise exception 'Transaksi terkunci: keuangan proyek sudah ditutup';
  end if;
  if tg_op='UPDATE' and new.project_id is distinct from old.project_id then
    select finance_closed_at into closed_at
    from public.projects where id=new.project_id for update;
    if closed_at is not null then
      raise exception 'Tidak dapat memindahkan transaksi ke proyek yang keuangannya ditutup';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists rr_guard_transaction_when_closed on public.transactions;
create trigger rr_guard_transaction_when_closed
  before insert or update or delete on public.transactions
  for each row execute function public.rr_guard_transaction_when_closed();

-- Mengunci baris proyek saat pembagian agar dua pengguna tidak
-- membagikan laba yang sama secara bersamaan.
create or replace function public.rr_limit_profit_distribution()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare
  total_profit numeric(15,2);
  distributed numeric(15,2);
begin
  select finance_close_profit into total_profit
  from public.projects
  where id=new.project_id and finance_closed_at is not null
  for update;

  if not found then
    raise exception 'Bagi hasil hanya tersedia setelah tutup keuangan';
  end if;

  select coalesce(sum(amount),0) into distributed
  from public.profit_distributions
  where project_id=new.project_id;

  if distributed + new.amount > total_profit then
    raise exception 'Jumlah bagi hasil melebihi laba final yang tersedia';
  end if;
  return new;
end;
$$;
drop trigger if exists rr_limit_profit_distribution on public.profit_distributions;
create trigger rr_limit_profit_distribution before insert on public.profit_distributions
  for each row execute function public.rr_limit_profit_distribution();

commit;