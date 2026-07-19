"""
Valida el modulo "Movimientos" (movements_report).

Chequeos de consistencia interna:
  destinationDensityByHectare ~= quantity / destinationPoolSize
  destinationDensityByMeter   ~= destinationDensityByHectare / 10000
  costPerThousand             ~= totalCost / quantity * 1000

Hallazgo conocido (jul/2026, ver conversacion): en un pequeno numero de movimientos
tipo "SIEMBRA LARVAS" el campo destinationDensityByHectare viene copiado de
sourceDensityByHectare en vez de recalcularse contra destinationPoolSize -
el script lo marca explicitamente cuando lo detecta para diferenciarlo de
otras inconsistencias.

Uso:
    python -m validacion.validar_movimientos --start 2026-07-01 --end 2026-07-31
"""
import argparse

from .client import ApiClient, SUBSIDIARY_IDS


def check_row(r: dict, tol_rel: float = 0.02) -> list:
    problems = []
    pool_size = r.get("destinationPoolSize") or 0
    qty = r.get("quantity") or 0
    cost = r.get("totalCost")

    if pool_size:
        exp = qty / pool_size
        got = r.get("destinationDensityByHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            src_density = r.get("sourceDensityByHectare")
            if src_density is not None and abs(got - src_density) < 1:
                problems.append(("destinationDensityByHectare", exp, got,
                                  "= sourceDensityByHectare sin recalcular para el pool destino"))
            else:
                problems.append(("destinationDensityByHectare", exp, got, ""))

        exp_m = exp / 10000
        got_m = r.get("destinationDensityByMeter") or 0
        if abs(exp_m - got_m) > max(0.5, exp_m * tol_rel):
            problems.append(("destinationDensityByMeter", exp_m, got_m, ""))

    if qty and cost is not None:
        exp = cost / qty * 1000
        got = r.get("costPerThousand") or 0
        if abs(exp - got) > max(0.05, exp * tol_rel):
            problems.append(("costPerThousand", exp, got, ""))

    return problems


def run(start: str, end: str):
    client = ApiClient()
    params = [("destinationSubsidiaryIds", i) for i in SUBSIDIARY_IDS] + [
        ("startDate", start), ("endDate", end),
    ]
    rows = client.get("movements_report", params=params)["data"]

    print(f"\nMovimientos {start} .. {end}  ({len(rows)} filas)\n")

    total_bad = 0
    for r in rows:
        problems = check_row(r)
        if problems:
            total_bad += 1
            label = f"[{r.get('type')}] {r.get('sourceSubsidiaryName')}/{r.get('sourcePoolName')} -> {r.get('destinationSubsidiaryName')}/{r.get('destinationPoolName')}"
            print(label)
            for field, exp, got, note in problems:
                extra = f"  <-- {note}" if note else ""
                print(f"    {field}: API={got:.2f}  esperado={exp:.2f}{extra}")

    print(f"\nFilas con inconsistencia: {total_bad} / {len(rows)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    args = ap.parse_args()
    run(args.start, args.end)


if __name__ == "__main__":
    main()
