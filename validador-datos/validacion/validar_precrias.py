"""
Valida el modulo "Resultados de Precrias" (report_harvest/NurseryYield).

Formulas confirmadas empiricamente sobre 165 filas (jul/2026):
  daysCycle              = daysProduction + daysDry                          (165/165 ok)
  finalSurvival          = transferQuantity / sowingQuantity * 100           (165/165 ok)
  sowingDensityPerHectare  = sowingQuantity / poolSize                       (165/165 ok)
  harvestDensityPerHectare = transferQuantity / poolSize                     (165/165 ok)
  biomassPerHectare      = biomass(lb) / poolSize                            (165/165 ok)
  costPerPound           = totalCost / biomass(lb)                          (165/165 ok)
  costPerKiogram         = totalCost / (biomass(lb) * 0.453592)             (165/165 ok)
  costPerThousand        = totalCost / transferQuantity * 1000              (165/165 ok)
  grossFCR               = accumulatedFeed(kg) / (biomass(lb) * 0.453592)   (165/165 ok)
  realFCR                = accumulatedFeed(kg) / (biomass_kg - biomasa_inicial_kg)
                           biomasa_inicial_kg = sowingQuantity * sowingAverageWeightGrams / 1000
                           (164/165 ok)

CAVEAT conocido: en filas de etapa larva/postlarva (stage=1) el campo de peso de
siembra a veces viene como "sowingAverageWeightPelegrams" en vez de
"sowingAverageWeightGrams" (con semantica distinta, probablemente PL/gramo en
vez de gramos/animal) - eso hace fallar el chequeo de realFCR para esas filas.
No es un error de calculo del backend, es una inconsistencia de nombre de
campo en la fuente; el script la reporta aparte.

Uso:
    python -m validacion.validar_precrias --start 2026-07-01 --end 2026-07-31
"""
import argparse

from .client import ApiClient, SUBSIDIARY_IDS

LB_KG = 0.453592


def check_row(r: dict, tol_rel: float = 0.02) -> list:
    problems = []
    ps = r.get("poolSize") or 0
    biomass_lb = r.get("biomass") or 0
    biomass_kg = biomass_lb * LB_KG
    feed = r.get("accumulatedFeed") or 0
    total_cost = r.get("totalCost") or 0
    sowing_qty = r.get("sowingQuantity") or 0
    transfer_qty = r.get("transferQuantity") or 0

    exp_days_cycle = (r.get("daysProduction") or 0) + (r.get("daysDry") or 0)
    if exp_days_cycle != r.get("daysCycle"):
        problems.append(("daysCycle", exp_days_cycle, r.get("daysCycle")))

    if sowing_qty:
        exp = transfer_qty / sowing_qty * 100
        got = r.get("finalSurvival") or 0
        if abs(exp - got) > 1:
            problems.append(("finalSurvival", exp, got))

    if ps:
        exp = sowing_qty / ps
        got = r.get("sowingDensityPerHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("sowingDensityPerHectare", exp, got))

        exp = transfer_qty / ps
        got = r.get("harvestDensityPerHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("harvestDensityPerHectare", exp, got))

        exp = biomass_lb / ps
        got = r.get("biomassPerHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("biomassPerHectare", exp, got))

    if biomass_lb:
        exp = total_cost / biomass_lb
        got = r.get("costPerPound") or 0
        if abs(exp - got) > max(0.02, exp * tol_rel):
            problems.append(("costPerPound", exp, got))

    if biomass_kg:
        exp = total_cost / biomass_kg
        got = r.get("costPerKiogram") or 0
        if abs(exp - got) > max(0.02, exp * tol_rel):
            problems.append(("costPerKilogram", exp, got))

        exp = feed / biomass_kg
        got = r.get("grossFCR") or 0
        if abs(exp - got) > max(0.02, exp * tol_rel):
            problems.append(("grossFCR", exp, got))

        # stage 1 (larva/postlarva) no trae este campo: el peso inicial es una fraccion
        # de gramo y su aporte a la ganancia de biomasa es despreciable, se asume 0.
        sowing_weight = r.get("sowingAverageWeightGrams") or 0
        initial_biomass_kg = sowing_qty * sowing_weight / 1000
        gain_kg = biomass_kg - initial_biomass_kg
        if gain_kg > 0:
            exp = feed / gain_kg
            got = r.get("realFCR") or 0
            if abs(exp - got) > max(0.03, exp * 0.03):
                problems.append(("realFCR", exp, got, ""))

    if transfer_qty:
        exp = total_cost / transfer_qty * 1000
        got = r.get("costPerThousand") or 0
        if abs(exp - got) > max(0.05, exp * tol_rel):
            problems.append(("costPerThousand", exp, got))

    return problems


def run(start: str, end: str):
    client = ApiClient()
    params = [("startDate", start), ("endDate", end)] + client.subsidiary_params() + [("PageSize", 1000)]
    rows = client.get("report_harvest/NurseryYield", params=params)["data"]

    print(f"\nResultados de Precrias {start} .. {end}  ({len(rows)} filas)\n")

    total_bad = 0
    for r in rows:
        problems = check_row(r)
        if problems:
            total_bad += 1
            print(f"[{r['cycleCode']} / {r['subsidiaryName']} / {r['poolName']}]")
            for p in problems:
                field, exp, got = p[0], p[1], p[2]
                note = p[3] if len(p) > 3 and p[3] else ""
                exp_s = f"{exp:.2f}" if isinstance(exp, (int, float)) else str(exp)
                extra = f"  <-- {note}" if note else ""
                print(f"    {field}: API={got}  esperado={exp_s}{extra}")

    print(f"\nFilas con inconsistencia: {total_bad} / {len(rows)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    args = ap.parse_args()
    run(args.start, args.end)


if __name__ == "__main__":
    main()
