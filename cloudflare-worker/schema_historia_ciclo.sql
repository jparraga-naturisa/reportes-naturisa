-- Historia semanal de cada ciclo (tablero nativo "Historia del ciclo - Siembra"),
-- fuente: cycle_histories/production/{cycleId}. Usable via GET /db/historia-ciclo?cycleId=<id>

CREATE TABLE IF NOT EXISTS historia_ciclo (
  cycle_id        INTEGER NOT NULL,
  week_of_year    INTEGER NOT NULL,
  start_of_week   TEXT,
  end_of_week     TEXT,
  production_days INTEGER,
  weight          REAL,
  estimated_weight_by_regresion REAL,
  growth_last_weeks REAL,
  growth_2_weeks  REAL,
  growth_4_weeks  REAL,
  growth_from_beginning REAL,
  survival        REAL,
  biomass_actual  REAL,
  biomass_week    REAL,
  total_actual_animals_per_square_meter REAL,
  biomass_harvested REAL,
  total_feed_week REAL,
  total_accumulate_feed REAL,
  total_feed_week_per_hectare_day REAL,
  fca             REAL,
  fca_gross       REAL,
  fca_week        REAL,
  est_m2          REAL,
  feed_factor     REAL,
  updated_at      TEXT,
  PRIMARY KEY (cycle_id, week_of_year)
);

CREATE INDEX IF NOT EXISTS idx_historia_ciclo_cycle ON historia_ciclo(cycle_id);
