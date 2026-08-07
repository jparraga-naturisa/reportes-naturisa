-- sucursales
ALTER TABLE sucursales RENAME COLUMN code TO codigo;
ALTER TABLE sucursales RENAME COLUMN name TO nombre;

-- piscinas
ALTER TABLE piscinas RENAME COLUMN id_pool TO id_piscina;
ALTER TABLE piscinas RENAME COLUMN name TO nombre;
ALTER TABLE piscinas RENAME COLUMN code_pool TO codigo_piscina;
ALTER TABLE piscinas RENAME COLUMN size TO tamano;
ALTER TABLE piscinas RENAME COLUMN subsidiary_id TO id_sucursal;
ALTER TABLE piscinas RENAME COLUMN type TO tipo;
ALTER TABLE piscinas RENAME COLUMN status TO estado;
ALTER TABLE piscinas RENAME COLUMN updated_at TO actualizado_en;

-- ciclos
ALTER TABLE ciclos RENAME COLUMN cycle_id TO id_ciclo;
ALTER TABLE ciclos RENAME COLUMN subsidiary_id TO id_sucursal;
ALTER TABLE ciclos RENAME COLUMN subsidiary_code TO codigo_sucursal;
ALTER TABLE ciclos RENAME COLUMN pool_name TO nombre_piscina;
ALTER TABLE ciclos RENAME COLUMN cycle_number TO numero_ciclo;
ALTER TABLE ciclos RENAME COLUMN cycle_code TO codigo_ciclo;
ALTER TABLE ciclos RENAME COLUMN cycle_usage TO uso_ciclo;
ALTER TABLE ciclos RENAME COLUMN date_sowing TO fecha_siembra;
ALTER TABLE ciclos RENAME COLUMN pool_size TO tamano_piscina;
ALTER TABLE ciclos RENAME COLUMN days_cycle TO dias_ciclo;
ALTER TABLE ciclos RENAME COLUMN days_dry TO dias_secos;
ALTER TABLE ciclos RENAME COLUMN days_production TO dias_produccion;
ALTER TABLE ciclos RENAME COLUMN start_date TO fecha_inicio;
ALTER TABLE ciclos RENAME COLUMN harvest_date TO fecha_cosecha;
ALTER TABLE ciclos RENAME COLUMN updated_at TO actualizado_en;

-- historia_ciclo
ALTER TABLE historia_ciclo RENAME COLUMN cycle_id TO id_ciclo;
ALTER TABLE historia_ciclo RENAME COLUMN week_of_year TO semana;
ALTER TABLE historia_ciclo RENAME COLUMN start_of_week TO inicio_semana;
ALTER TABLE historia_ciclo RENAME COLUMN end_of_week TO fin_semana;
ALTER TABLE historia_ciclo RENAME COLUMN production_days TO dias_produccion;
ALTER TABLE historia_ciclo RENAME COLUMN weight TO peso;
ALTER TABLE historia_ciclo RENAME COLUMN estimated_weight_by_regresion TO peso_estimado_regresion;
ALTER TABLE historia_ciclo RENAME COLUMN growth_last_weeks TO crecimiento_ultima_semana;
ALTER TABLE historia_ciclo RENAME COLUMN growth_2_weeks TO crecimiento_2_semanas;
ALTER TABLE historia_ciclo RENAME COLUMN growth_4_weeks TO crecimiento_4_semanas;
ALTER TABLE historia_ciclo RENAME COLUMN growth_from_beginning TO crecimiento_desde_inicio;
ALTER TABLE historia_ciclo RENAME COLUMN survival TO supervivencia;
ALTER TABLE historia_ciclo RENAME COLUMN biomass_actual TO biomasa_actual;
ALTER TABLE historia_ciclo RENAME COLUMN biomass_week TO biomasa_semana;
ALTER TABLE historia_ciclo RENAME COLUMN total_actual_animals_per_square_meter TO animales_por_m2;
ALTER TABLE historia_ciclo RENAME COLUMN biomass_harvested TO biomasa_cosechada;
ALTER TABLE historia_ciclo RENAME COLUMN total_feed_week TO alimento_semana;
ALTER TABLE historia_ciclo RENAME COLUMN total_accumulate_feed TO alimento_acumulado;
ALTER TABLE historia_ciclo RENAME COLUMN total_feed_week_per_hectare_day TO alimento_ha_dia;
ALTER TABLE historia_ciclo RENAME COLUMN fca_gross TO fca_bruto;
ALTER TABLE historia_ciclo RENAME COLUMN fca_week TO fca_semana;
ALTER TABLE historia_ciclo RENAME COLUMN feed_factor TO factor_alimento;
ALTER TABLE historia_ciclo RENAME COLUMN updated_at TO actualizado_en;
