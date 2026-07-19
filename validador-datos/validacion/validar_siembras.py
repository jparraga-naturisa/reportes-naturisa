"""
Valida el modulo "Siembras" (cycle_sowing_report).

Es un listado transaccional (no un agregado como report_production), asi que la
validacion consiste en:
  1. Chequear consistencia interna fila-a-fila entre las cantidades base y los
     campos derivados que trae la propia API:
       densityPerHectare  ~= quantitySown / poolSize
       densityPerMeter    ~= densityPerHectare / 10000
       costPerPound       ~= totalCost / totalWeightPounds
       costPerThousand    ~= totalCost / quantitySown * 1000
  2. Recalcular los totales del pie de tabla (Ha, AnimalTotal, Densidad ponderada,
     Costo total, Peso promedio ponderado) para que se puedan comparar a ojo
     contra el pantallazo con el mismo rango de fechas/fincas.

Uso:
    python -m validacion.validar_siembras --start 2026-07-01 --end 2026-07-31
"""
import argparse

from .client import ApiClient


def check_row(r: dict, tol_rel: float = 0.02) -> list:
    problems = []
    pool_size = r.get("poolSize") or 0
    qty = r.get("quantitySown") or 0
    weight_lb = r.get("totalWeightPounds") or 0
    cost = r.get("totalCost") or 0

    if pool_size:
        exp = qty / pool_size
        got = r.get("densityPerHectare") or 0
        if abs(exp - got) > max(1, exp * tol_rel):
            problems.append(("densityPerHectare", exp, got))
        exp_m = exp / 10000
        got_m = r.get("densityPerMeter") or 0
        if abs(exp_m - got_m) > max(0.5, exp_m * tol_rel):
            problems.append(("densityPerMeter", exp_m, got_m))

    if weight_lb:
        exp = cost / weight_lb
        got = r.get("costPerPound") or 0
        if abs(exp - got) > max(0.5, exp * tol_rel):
            problems.append(("costPerPound", exp, got))

    if qty:
        exp = cost / qty * 1000
        got = r.get("costPerThousand") or 0
        if abs(exp - got) > max(0.05, exp * tol_rel):
            problems.append(("costPerThousand", exp, got))

    return problems


def run(start: str, end: str):
    client = ApiClient()
    data = client.get("cycle_sowing_report", params=client.subsidiary_params() + [
        ("startDate", start), ("endDate", end),
    ])
    rows = data["data"]

    print(f"\nSiembras {start} .. {end}  ({len(rows)} filas)\n")

    total_bad = 0
    for r in rows:
        problems = check_row(r)
        if problems:
            total_bad += 1
            print(f"[{r['cycleCode']} / {r['subsidiary']} / {r['poolName']}]")
            for field, exp, got in problems:
                print(f"    {field}: API={got:.2f}  esperado={exp:.2f}")

    ha = sum(r.get("poolSize") or 0 for r in rows)
    animal_total = sum(r.get("quantitySown") or 0 for r in rows)
    costo_total = sum(r.get("totalCost") or 0 for r in rows)
    peso_wavg = (sum((r.get("averageWeightGrams") or 0) * (r.get("quantitySown") or 0) for r in rows) / animal_total
                 if animal_total else None)
    dens_ha_wavg = animal_total / ha if ha else None

    print("\n--- Totales recalculados (compara contra el pie de tabla en pantalla) ---")
    print(f"Ha total:              {ha:,.1f}")
    print(f"Animal Total:          {animal_total:,.0f}")
    print(f"Densidad/Ha (ponder.): {dens_ha_wavg:,.1f}" if dens_ha_wavg else "Densidad/Ha: N/A")
    print(f"Peso Prom (ponder.):   {peso_wavg:,.2f} g" if peso_wavg else "Peso Prom: N/A")
    print(f"Costo total:           {costo_total:,.2f}")

    print(f"\nFilas con inconsistencia interna: {total_bad} / {len(rows)}")
    if total_bad == 0:
        print("Todos los campos derivados (densidad, costo/lb, costo/millar) cuadran con las cantidades base.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    args = ap.parse_args()
    run(args.start, args.end)


if __name__ == "__main__":
    main()
