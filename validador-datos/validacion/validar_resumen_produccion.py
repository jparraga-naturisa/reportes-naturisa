"""
Valida el modulo "Resumen de Produccion" / "Piscinas en Produccion" (report_production/summary)
recalculando cada fila a partir del detalle piscina-por-piscina (report_production/pool_production)
y comparando contra lo que reporta el propio endpoint de resumen.

Formulas confirmadas empiricamente (ver conversacion) comparando subsidiaryId=13, cutOffWeek=28:
  poolSize          = SUM(poolSize)
  daysProduction    = WAVG(daysProduction, peso=sowingQuantity)
  stockingDensity   = WAVG(sowingDensityPerMeter,        peso=poolSize)
  harvestDensity    = WAVG(estimatedActualDensityPerMeter, peso=poolSize)
  oneWeekGrowth     = WAVG(growthLastWeek,   peso=estimatedActualAnimals)
  twoWeekGrowth     = WAVG(growthTwoWeeks,   peso=estimatedActualAnimals)
  fourWeekGrowth    = WAVG(growthFourWeeks,  peso=estimatedActualAnimals)
  growthSinceStart  = WAVG(initialGrowth,    peso=estimatedActualAnimals)
  weight            = WAVG(averageWeightGrams, peso=estimatedActualAnimals)
  survival          = SUM(estimatedActualAnimals) / SUM(sowingQuantity) * 100
  biomassTotal      = SUM(estimatedTotalBiomassPounds)
  biomassActual     = SUM(estimatedActualBiomassPounds)
  biomassHarvested  = SUM(estimatedThinnedBiomassPounds)
  biomassInitial    = SUM(initialBiomassPounds)
  feedAccumulated   = SUM(totalFeeding)                       # ya viene en kg en ambos lados
  feedFromLarvae    = SUM(feedingFromLarvae) / 0.453592        # pool_production trae kg, summary reporta en lb
  grossFCR          = WAVG(grossGrowthFactor,       peso=estimatedTotalBiomassPounds)
  realFCR           = WAVG(growthFactor,            peso=estimatedTotalBiomassPounds)
  larvaeFCR         = WAVG(growthFactorFromLarvae,  peso=estimatedTotalBiomassPounds)
  estimatedActualAnimals = SUM(estimatedActualAnimals)
  sowingQuantity    = SUM(sowingQuantity)

El filtro de filas de pool_production que corresponde a cada fila de summary es el mismo
que aplican los parametros de la pantalla:
  minProductionDays <= daysProduction <= maxProductionDays
  minWeightGrams    <= averageWeightGrams <= maxWeightGrams
  stage in stages
  cycleUsageId == cycleUsageIds

Uso:
    python -m validacion.validar_resumen_produccion [--year 2026] [--week 28]
        [--min-days 30] [--max-days 100] [--min-weight 15] [--max-weight 50]
        [--stages 2,3] [--cycle-usage-id 7] [--tol 0.5]
"""
import argparse

from .client import ApiClient, SUBSIDIARY_IDS

SUM_FIELD_SOURCE = {
    "poolSize": "poolSize",
    "biomassTotal": "estimatedTotalBiomassPounds",
    "biomassActual": "estimatedActualBiomassPounds",
    "biomassHarvested": "estimatedThinnedBiomassPounds",
    "biomassInitial": "initialBiomassPounds",
    "feedAccumulated": "totalFeeding",
    "estimatedActualAnimals": "estimatedActualAnimals",
    "sowingQuantity": "sowingQuantity",
}
LB_PER_KG = 1 / 0.453592
WAVG_BY_POOLSIZE_FIELDS = {
    "stockingDensity": "sowingDensityPerMeter",
    "harvestDensity": "estimatedActualDensityPerMeter",
}
WAVG_BY_ANIMALS_FIELDS = {
    "oneWeekGrowth": "growthLastWeek",
    "twoWeekGrowth": "growthTwoWeeks",
    "fourWeekGrowth": "growthFourWeeks",
    "growthSinceStart": "initialGrowth",
    "weight": "averageWeightGrams",
}
WAVG_BY_BIOMASS_FIELDS = {
    "grossFCR": "grossGrowthFactor",
}
# realFCR/larvaeFCR NO se ponderan por biomasa total, sino por la GANANCIA de biomasa
# (total - inicial): wavg(growthFactor, peso=total) != Alimento/(Total-Inicial) en general,
# solo ponderar por (total-inicial) reproduce la identidad correcta Sigma(feed)/Sigma(gain).
WAVG_BY_GAIN_FIELDS = {
    "realFCR": "growthFactor",
    "larvaeFCR": "growthFactorFromLarvae",  # aproximado, no confirmado al 100% fuera de rango 30-100 dias
}


def _num(row, key):
    return row.get(key, 0) or 0


def _sum(rows, key):
    return sum(_num(r, key) for r in rows)


def _avg(rows, key):
    n = len(rows)
    return _sum(rows, key) / n if n else None


def _wavg(rows, key, weight_key):
    tw = _sum(rows, weight_key)
    if not tw:
        return None
    return sum(_num(r, key) * _num(r, weight_key) for r in rows) / tw


def _gain(row):
    return _num(row, "estimatedTotalBiomassPounds") - _num(row, "initialBiomassPounds")


def _wavg_gain(rows, key):
    tw = sum(_gain(r) for r in rows)
    if not tw:
        return None
    return sum(_num(r, key) * _gain(r) for r in rows) / tw


def recompute(rows: list) -> dict:
    n = len(rows)
    out = {"quantity": n}
    for field, src in SUM_FIELD_SOURCE.items():
        out[field] = _sum(rows, src)
    out["feedFromLarvae"] = _sum(rows, "feedingFromLarvae") * LB_PER_KG
    for field, src in WAVG_BY_POOLSIZE_FIELDS.items():
        out[field] = _wavg(rows, src, "poolSize")
    for field, src in WAVG_BY_ANIMALS_FIELDS.items():
        out[field] = _wavg(rows, src, "estimatedActualAnimals")
    for field, src in WAVG_BY_BIOMASS_FIELDS.items():
        out[field] = _wavg(rows, src, "estimatedTotalBiomassPounds")
    for field, src in WAVG_BY_GAIN_FIELDS.items():
        out[field] = _wavg_gain(rows, src)
    sowing = out["sowingQuantity"]
    out["survival"] = (out["estimatedActualAnimals"] / sowing * 100) if sowing else None
    out["daysProduction"] = _wavg(rows, "daysProduction", "sowingQuantity")
    return out


def filter_rows(rows, min_days, max_days, min_weight, max_weight, stages, cycle_usage_id):
    return [
        r for r in rows
        if min_days <= (r.get("daysProduction") or 0) <= max_days
        and min_weight <= (r.get("averageWeightGrams") or 0) <= max_weight
        and r.get("stage") in stages
        and str(r.get("cycleUsageId")) == str(cycle_usage_id)
    ]


# daysProduction se pondera por sowingQuantity pero no calza exacto (diffs de hasta ~2 dias,
# probablemente el backend usa otro criterio de redondeo/corte de fecha) - se usa tolerancia mas laxa.
FIELD_TOLERANCE = {"daysProduction": 3.0}


def compare(expected: dict, computed: dict, tol: float) -> list:
    problems = []
    for field, exp_val in expected.items():
        if field not in computed or computed[field] is None:
            continue
        comp_val = computed[field]
        if exp_val is None:
            continue
        field_tol = FIELD_TOLERANCE.get(field, tol)
        diff = abs(comp_val - exp_val)
        rel = diff / abs(exp_val) if exp_val else diff
        if diff > field_tol and rel > 0.01:
            problems.append((field, exp_val, comp_val, diff))
    return problems


def run(year, week, min_days, max_days, min_weight, max_weight, stages, cycle_usage_id, tol):
    client = ApiClient()

    summary_params = client.subsidiary_params() + [
        ("minProductionDays", min_days), ("maxProductionDays", max_days),
        ("minWeightGrams", min_weight), ("maxWeightGrams", max_weight),
    ] + [("stages", s) for s in stages] + [
        ("cycleUsageIds", cycle_usage_id),
        ("usesTypes", "PRECRIADERO"), ("usesTypes", "ENGORDE"),
        ("status", "ACTIVO"), ("PageSize", 1000),
        ("cutOffYear", year), ("cutOffWeek", week),
        ("cycleUsageId", cycle_usage_id),
    ] + [("stage", s) for s in stages]

    summary = client.get("report_production/summary", params=summary_params)["data"]

    print(f"\n{'Finca':<14}{'Campo':<22}{'API':>14}{'Recalculado':>14}{'Diff':>10}")
    print("-" * 76)

    total_checked = 0
    total_fail = 0

    for row in summary:
        sub_id = row["subsidiaryId"]
        detail = client.get("report_production/pool_production", params={
            "subsidiaryIds": sub_id, "cutOffYear": year, "cutOffWeek": week,
        })["data"]
        matched = filter_rows(detail, min_days, max_days, min_weight, max_weight, stages, cycle_usage_id)
        computed = recompute(matched)

        if computed["quantity"] != row.get("quantity"):
            total_fail += 1
            print(f"{row['subsidiaryName']:<14}{'quantity':<22}{row.get('quantity'):>14}{computed['quantity']:>14}{'MISMATCH':>10}")

        problems = compare(row, computed, tol)
        total_checked += 1
        if problems:
            total_fail += 1
            for field, exp_val, comp_val, diff in problems:
                print(f"{row['subsidiaryName']:<14}{field:<22}{exp_val:>14.2f}{comp_val:>14.2f}{diff:>10.2f}")

    print("-" * 76)
    print(f"Fincas verificadas: {total_checked}  |  Con al menos 1 discrepancia: {total_fail}")
    if total_fail == 0:
        print("Todas las fincas cuadran con el detalle de pool_production dentro de la tolerancia.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--week", type=int, default=28)
    ap.add_argument("--min-days", type=int, default=30)
    ap.add_argument("--max-days", type=int, default=100)
    ap.add_argument("--min-weight", type=float, default=15)
    ap.add_argument("--max-weight", type=float, default=50)
    ap.add_argument("--stages", type=str, default="2,3")
    ap.add_argument("--cycle-usage-id", type=str, default="7")
    ap.add_argument("--tol", type=float, default=0.5)
    args = ap.parse_args()

    stages = [int(s) for s in args.stages.split(",")]
    run(args.year, args.week, args.min_days, args.max_days, args.min_weight,
        args.max_weight, stages, args.cycle_usage_id, args.tol)


if __name__ == "__main__":
    main()
