-- Jalankan file ini SEKALI jika supabase.sql versi lama sudah pernah dijalankan.
-- Menambahkan tipe dokumen Kwitansi tanpa menghapus data yang sudah ada.

alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents
  add constraint documents_doc_type_check
  check (doc_type in ('invoice','receipt','proposal','spk'));

create or replace function public.next_document_number(p_type text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  ym text := to_char(now() at time zone 'Asia/Jakarta', 'YYYYMM');
  n integer;
  prefix text;
begin
  prefix := case p_type
    when 'invoice' then 'INV'
    when 'receipt' then 'KWT'
    when 'proposal' then 'PROP'
    when 'spk' then 'SPK'
    when 'bast_installation' then 'BAST-P'
    when 'bast_final' then 'BAST-S'
    when 'project' then 'PRJ'
    else upper(p_type)
  end;

  insert into public.document_counters(doc_type, year_month, counter)
  values (p_type, ym, 1)
  on conflict (doc_type, year_month)
  do update set counter = public.document_counters.counter + 1
  returning counter into n;

  return prefix || '/RR/' || ym || '/' || lpad(n::text, 3, '0');
end;
$$;

grant execute on function public.next_document_number(text) to authenticated;
