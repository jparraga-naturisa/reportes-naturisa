-- Plan de cosechas/raleos por ciclo (via harvest_programs/report de AP1), sincronizado por el
-- cron liviano cada 6 horas - usable desde cualquier dashboard via GET /db/plan-cosecha
CREATE TABLE IF NOT EXISTS plan_cosecha (
  id_ciclo INTEGER PRIMARY KEY,
  instructions TEXT,
  biomasa_actual_lb REAL,
  current_week REAL,
  one_week REAL,
  two_week REAL,
  three_week REAL,
  four_week REAL,
  five_week REAL,
  six_week REAL,
  actualizado_en TEXT
);
