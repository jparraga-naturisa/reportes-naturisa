"""
Valida el modulo "Cosechas por Fechas" (report_harvest/HarvestsByDate).

Formulas confirmadas empiricamente sobre 305 filas (jul/2026), 0 fallos:
  poundsByHectare  = netPounds / poolSize
  daysCycle        = daysProduction + daysDry
  saleByPound      = totalSale / netPounds
  saleByHectareDay = totalSale / poolSize / daysCycle
  wholeYield       = wholePounds / netPounds * 100

NOTA: densityByHectare/densityByMeter (animales/Ha) NO se pudo derivar con
certeza a partir de los campos disponibles (wholePounds, generalWeight,
wholeWeight, farmReportedWeight) - la hipotesis mas cercana solo calzaba en
~25% de las filas, asi que se dejan fuera del chequeo estricto para evitar
falsos positivos. Si se necesita validar densidad, pedir al backend el campo
de "animales cosechados" explicito.

Uso:
    python -m validacion.validar_cosechas_fechas --start 2026-07-01 --end 2026-07-31
"""
import argparse

from .client import ApiClient, SUBSIDIARY_IDS


def check_row(r: dict, tol_rel: float = 0.02) -> list:
    problems = []
    ps = r.get("poolSize") or 0
    net = r.get("netPounds")
    days_cycle = (r.get("daysProduction") or 0) + (r.get("daysDry") or 0)

    if ps and net is not None:
        exp = net / ps
        got = r.get("poundsByHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("poundsByHectare", exp, got))

    if days_cycle != r.get("daysCycle"):
        problems.append(("daysCycle", days_cycle, r.get("daysCycle")))

    if net:
        exp = (r.get("totalSale") or 0) / net
        got = r.get("saleByPound") or 0
        if abs(exp - got) > max(0.02, exp * tol_rel):
            problems.append(("saleByPound", exp, got))

        exp_y = (r.get("wholePounds") or 0) / net * 100
        got_y = r.get("wholeYield") or 0
        if abs(exp_y - got_y) > 1:
            problems.append(("wholeYield", exp_y, got_y))

    if ps and days_cycle:
        exp = (r.get("totalSale") or 0) / ps / days_cycle
        got = r.get("saleByHectareDay") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("saleByHectareDay", exp, got))

    return problems


def run(start: str, end: str):
    client = ApiClient()
    params = [("subsidiaryIds", i) for i in SUBSIDIARY_IDS] + [
        ("startDate", start), ("endDate", end),
    ]
    rows = client.get("report_harvest/HarvestsByDate", params=params)["data"]

    print(f"\nCosechas por Fechas {start} .. {end}  ({len(rows)} filas)\n")

    total_bad = 0
    for r in rows:
        problems = check_row(r)
        if problems:
            total_bad += 1
            print(f"[{r['cycleCode']} / {r['subsidiary']} / {r['poolName']}]")
            for field, exp, got in problems:
                print(f"    {field}: API={got}  esperado={exp:.2f}")

    print(f"\nFilas con inconsistencia: {total_bad} / {len(rows)}")
    print("(densityByHectare/densityByMeter no se validan - formula no confirmada, ver docstring)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    args = ap.parse_args()
    run(args.start, args.end)


if __name__ == "__main__":
    main()
