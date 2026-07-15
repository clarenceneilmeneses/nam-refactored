-- 10_sane_dates.sql — reject typo dates at the database level.
--
-- The legacy import contained dates like 0206-02-12 and 0004-05-04 (valid ISO,
-- wrong century). Those rows were corrected on 2026-07-07 (system_logs "Data
-- Correction"); these constraints stop new ones from being entered. NULLs pass
-- automatically (a NULL comparison is not FALSE, so CHECK is satisfied).

alter table sales
  add constraint sales_date_sane
    check (date >= '2000-01-01' and date < '2100-01-01'),
  add constraint sales_date_paid_sane
    check (date_paid >= '2000-01-01' and date_paid < '2100-01-01'),
  add constraint sales_due_date_sane
    check (due_date >= '2000-01-01' and due_date < '2100-01-01'),
  add constraint sales_date_delivered_sane
    check (date_delivered >= '2000-01-01' and date_delivered < '2100-01-01');

alter table quotations
  add constraint quotations_date_sane
    check (date >= '2000-01-01' and date < '2100-01-01');
