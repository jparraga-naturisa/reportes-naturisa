"""
Consulta un ciclo puntual (sucursal + piscina + numero de ciclo) en todos los
modulos donde aparece y muestra los datos lado a lado, marcando diferencias.

A diferencia de los validadores masivos (validar_*.py) esta herramienta esta
pensada para el uso diario: "que dice cada modulo sobre la piscina X del
ciclo Y de la finca Z, y coincide?".

Modulos consultados:
  - Piscinas en Produccion   (report_production/pool_production) - snapshot semana actual
  - Siembras                 (cycle_sowing_report)               - rango de fechas
  - Cosechas por Fechas      (report_harvest/HarvestsByDate)      - rango de fechas
  - Resultados de Precrias   (report_harvest/NurseryYield)        - rango de fechas
  - Movimientos              (movements_report)                  - rango de fechas, entradas/salidas de esa piscina
  - Tablero Ciclo (por cycleId, una vez resuelto desde cualquiera de los anteriores):
      cycle_sampling_weights/cycle      -> ultimo peso muestreado
      cycle_sampling_survivals/cycle    -> ultima sobrevivencia muestreada
      cycle_feeding/cycle               -> alimento total registrado
      cycle_histories/calendar/{id}     -> historial crudo (se muestra aparte)

Los conceptos "estaticos" (Ha, animales sembrados, densidad y peso de siembra) se
fijan en el momento de la siembra y NO deberian variar entre modulos -> cualquier
diferencia se marca como inconsistencia real.
Los conceptos "dinamicos" (peso actual, densidad actual, dias, sobrevivencia,
alimento acumulado, FCA) cambian segun la fecha de corte de cada modulo -> se
muestran con su fecha de referencia para que el usuario juzgue si la diferencia
es logica (crecimiento en el tiempo) o no.

Uso:
    python -m validacion.consultar_ciclo --sucursal A1 --piscina 0454 --ciclo 18
    python -m validacion.consultar_ciclo --sucursal CA --piscina 113 --ciclo 8 --days-back 200
"""
import argparse
from datetime import date, timedelta

from .client import ApiClient, SUBSIDIARY_IDS

STATIC_TOL_REL = 0.01


def norm_pool(name) -> str:
    s = str(name).strip().upper()
    stripped = s.lstrip("0")
    return stripped if stripped else s


def find_all(rows, sub_field, pool_field, cycle_field, sub_code, pool_name, cycle_number):
    return [
        r for r in rows
        if str(r.get(sub_field, "")).upper() == sub_code.upper()
        and norm_pool(r.get(pool_field, "")) == norm_pool(pool_name)
        and r.get(cycle_field) == cycle_number
    ]


def aggregate_rows(rows, sum_fields=(), weighted_avg_fields=(), max_fields=()):
    """Un mismo ciclo puede tener varias filas (varios lotes/geneticas sembradas o
    varias cosechas parciales) - hay que sumarlas, no quedarse con la primera."""
    if not rows:
        return None
    out = dict(rows[0])
    out["_n_lotes"] = len(rows)
    if len(rows) == 1:
        return out
    for f in sum_fields:
        out[f] = sum(r.get(f, 0) or 0 for r in rows)
    for f in max_fields:
        out[f] = max((r.get(f, 0) or 0) for r in rows)
    for f, w in weighted_avg_fields:
        tw = sum(r.get(w, 0) or 0 for r in rows)
        out[f] = (sum((r.get(f, 0) or 0) * (r.get(w, 0) or 0) for r in rows) / tw) if tw else rows[0].get(f)
    return out


def fetch_piscinas_produccion(client, sub_id, sub_code, pool_name, cycle_number):
    today = date.today()
    year, week, _ = today.isocalendar()
    rows = client.get("report_production/pool_production", params={
        "subsidiaryIds": sub_id, "cutOffYear": year, "cutOffWeek": week,
    })["data"]
    matched = find_all(rows, "subsidiaryCode", "poolName", "cycleNumber", sub_code, pool_name, cycle_number)
    return aggregate_rows(matched,
                           sum_fields=("sowingQuantity", "totalFeeding", "estimatedActualAnimals"),
                           weighted_avg_fields=(("averageWeightGrams", "estimatedActualAnimals"),
                                                ("growthFactor", "estimatedTotalBiomassPounds")))


def fetch_siembras(client, sub_id, sub_code, pool_name, cycle_number, start, end):
    rows = client.get("cycle_sowing_report", params=[("subsidiaryIds", sub_id), ("startDate", start), ("endDate", end)])["data"]
    matched = find_all(rows, "subsidiaryCode", "poolName", "cycleNumber", sub_code, pool_name, cycle_number)
    agg = aggregate_rows(matched,
                          sum_fields=("quantitySown", "totalCost", "totalWeightPounds"),
                          weighted_avg_fields=(("averageWeightGrams", "quantitySown"),))
    if agg and len(matched) > 1 and agg.get("poolSize"):
        # la densidad de siembra hay que recalcularla desde el total sembrado, no sumarla ni promediarla
        agg["densityPerHectare"] = agg["quantitySown"] / agg["poolSize"]
        agg["densityPerMeter"] = agg["densityPerHectare"] / 10000
    return agg


def fetch_cosechas(client, sub_id, sub_code, pool_name, cycle_number, start, end):
    rows = client.get("report_harvest/HarvestsByDate", params=[("subsidiaryIds", sub_id), ("startDate", start), ("endDate", end)])["data"]
    matched = find_all(rows, "subsidiaryCode", "poolName", "cycleNumber", sub_code, pool_name, cycle_number)
    agg = aggregate_rows(matched,
                          sum_fields=("sentPounds", "netPounds", "wholePounds", "wholeAnimals",
                                      "finalAnimals", "sowingAnimals", "totalSale", "totalSettlement"),
                          weighted_avg_fields=(("wholeWeight", "wholePounds"), ("generalWeight", "wholePounds")),
                          max_fields=("daysProduction", "daysCycle"))
    if agg and len(matched) > 1 and agg.get("poolSize"):
        agg["poundsByHectare"] = agg["netPounds"] / agg["poolSize"]
        agg["saleByPound"] = (agg["totalSale"] / agg["netPounds"]) if agg["netPounds"] else None
        agg["wholeYield"] = (agg["wholePounds"] / agg["netPounds"] * 100) if agg["netPounds"] else None
    return agg


def fetch_precrias(client, sub_id, sub_code, pool_name, cycle_number, start, end):
    rows = client.get("report_harvest/NurseryYield", params=[("startDate", start), ("endDate", end), ("subsidiaryIds", sub_id), ("PageSize", 1000)])["data"]
    matched = find_all(rows, "subsidiaryCode", "poolName", "cycleNumber", sub_code, pool_name, cycle_number)
    agg = aggregate_rows(matched,
                          sum_fields=("transferQuantity", "sowingQuantity", "accumulatedFeed", "biomass", "totalCost"),
                          weighted_avg_fields=(("sowingAverageWeightGrams", "sowingQuantity"),
                                               ("harvestAverageWeightGrams", "transferQuantity")))
    if agg and len(matched) > 1:
        if agg.get("sowingQuantity"):
            agg["finalSurvival"] = agg["transferQuantity"] / agg["sowingQuantity"] * 100
        if agg.get("poolSize"):
            agg["sowingDensityPerHectare"] = agg["sowingQuantity"] / agg["poolSize"]
            agg["harvestDensityPerHectare"] = agg["transferQuantity"] / agg["poolSize"]
    return agg


def fetch_movimientos(client, sub_code, pool_name, cycle_number, start, end):
    params = [("destinationSubsidiaryIds", i) for i in SUBSIDIARY_IDS] + [("startDate", start), ("endDate", end)]
    rows = client.get("movements_report", params=params)["data"]
    entradas = [r for r in rows if str(r.get("destinationSubsidiaryCode", "")).upper() == sub_code.upper()
                and norm_pool(r.get("destinationPoolName", "")) == norm_pool(pool_name)
                and r.get("destinationCycleNumber") == cycle_number]
    salidas = [r for r in rows if str(r.get("sourceSubsidiaryCode", "")).upper() == sub_code.upper()
               and norm_pool(r.get("sourcePoolName", "")) == norm_pool(pool_name)]
    return entradas, salidas


def fetch_ciclo_tablero(client, cycle_id):
    out = {}
    try:
        weights = client.get("cycle_sampling_weights/cycle", params={"cycleId": cycle_id, "status": "ACTIVO", "orderBy": "samplingDate asc"})["data"]
        out["ultimo_peso"] = weights[-1] if weights else None
    except Exception as e:
        out["ultimo_peso"] = None
        out["_err_peso"] = str(e)
    try:
        survivals = client.get("cycle_sampling_survivals/cycle", params={"cycleId": cycle_id, "status": "ACTIVO", "orderBy": "samplingDate asc"})["data"]
        out["ultima_sobrevivencia"] = survivals[-1] if survivals else None
    except Exception as e:
        out["ultima_sobrevivencia"] = None
        out["_err_surv"] = str(e)
    try:
        feeding = client.get("cycle_feeding/cycle", params={"status": "ACTIVO", "cycleId": cycle_id, "orderBy": "feedingDate asc"})["data"]
        out["alimento_total"] = sum((f.get("totalKilograms") or 0) for f in feeding)
        out["n_registros_alimento"] = len(feeding)
    except Exception as e:
        out["alimento_total"] = None
        out["_err_feed"] = str(e)
    return out


def g(row, *fields):
    if row is None:
        return None
    for f in fields:
        v = row.get(f)
        if v is not None:
            return v
    return None


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:,.2f}"
    return f"{v:,}" if isinstance(v, int) else str(v)


COL_WIDTH = 18


def print_concept(label, values: dict, static: bool):
    present = {k: v for k, v in values.items() if v is not None}
    line = f"{label:<28}"
    for mod, v in values.items():
        line += f"{fmt(v):>{COL_WIDTH}}"
    flag = ""
    if static and len(present) > 1:
        vals = list(present.values())
        base = vals[0]
        if base and any(abs(v - base) / abs(base) > STATIC_TOL_REL for v in vals[1:] if isinstance(v, (int, float)) and isinstance(base, (int, float))):
            flag = "  <-- DIFERENTE (deberia ser igual)"
    print(line + flag)


def run(sucursal, piscina, ciclo, start, end):
    client = ApiClient()
    sub_id = client.resolve_subsidiary_id(sucursal)
    sub_code = sucursal.upper() if not str(sucursal).isdigit() else next(
        k for k, v in client.subsidiary_map().items() if v["id"] == sub_id)

    print(f"\nBuscando {sub_code} / piscina {piscina} / ciclo {ciclo}  (rango {start}..{end})\n")

    pp = fetch_piscinas_produccion(client, sub_id, sub_code, piscina, ciclo)
    si = fetch_siembras(client, sub_id, sub_code, piscina, ciclo, start, end)
    co = fetch_cosechas(client, sub_id, sub_code, piscina, ciclo, start, end)
    pr = fetch_precrias(client, sub_id, sub_code, piscina, ciclo, start, end)
    entradas, salidas = fetch_movimientos(client, sub_code, piscina, ciclo, start, end)

    found_any = pp or si or co or pr or entradas
    if not found_any:
        print("No se encontro ese ciclo en ningun modulo dentro del rango de fechas dado.")
        print("Prueba ampliando --days-back o revisa que sucursal/piscina/ciclo sean correctos.")
        return

    cycle_id = g(pp, "idCycle") or g(si, "cycleId") or g(co, "cycleId") or g(pr, "cycleId")
    if entradas and not cycle_id:
        cycle_id = entradas[0].get("destinationCycleId")

    ct = fetch_ciclo_tablero(client, cycle_id) if cycle_id else {}

    header = f"{'Concepto':<28}" + "".join(f"{h:>{COL_WIDTH}}" for h in
              ["Piscinas Prod.", "Siembras", "Cosechas x Fecha", "Precrias", "Tablero Ciclo"])
    print(header)
    print("-" * len(header))

    print_concept("Ha (tamano piscina)", {
        "Piscinas Prod.": g(pp, "poolSize"), "Siembras": g(si, "poolSize"),
        "Cosechas x Fecha": g(co, "poolSize"), "Precrias": g(pr, "poolSize"), "Tablero Ciclo": None,
    }, static=True)

    print_concept("Animales sembrados", {
        "Piscinas Prod.": g(pp, "sowingQuantity"), "Siembras": g(si, "quantitySown"),
        "Cosechas x Fecha": None, "Precrias": g(pr, "sowingQuantity"), "Tablero Ciclo": None,
    }, static=True)

    print_concept("Densidad siembra (/Ha)", {
        "Piscinas Prod.": g(pp, "sowingDensityPerHectare"), "Siembras": g(si, "densityPerHectare"),
        "Cosechas x Fecha": None, "Precrias": g(pr, "sowingDensityPerHectare"), "Tablero Ciclo": None,
    }, static=True)

    print_concept("Peso siembra (g)", {
        "Piscinas Prod.": g(pp, "sowingAverageWeightGrams"), "Siembras": g(si, "averageWeightGrams"),
        "Cosechas x Fecha": None, "Precrias": g(pr, "sowingAverageWeightGrams"), "Tablero Ciclo": None,
    }, static=True)

    print("\n--- Conceptos dinamicos (cambian segun la fecha de corte de cada modulo) ---\n")

    ultimo_peso = ct.get("ultimo_peso")
    print_concept("Peso actual/cosecha (g)", {
        "Piscinas Prod.": g(pp, "averageWeightGrams"), "Siembras": None,
        "Cosechas x Fecha": g(co, "wholeWeight", "generalWeight"), "Precrias": g(pr, "harvestAverageWeightGrams"),
        "Tablero Ciclo": g(ultimo_peso, "averageWeightGrams"),
    }, static=False)

    print_concept("Densidad actual (/Ha)", {
        "Piscinas Prod.": g(pp, "estimatedActualDensityPerHectare"), "Siembras": None,
        "Cosechas x Fecha": g(co, "densityByHectare"), "Precrias": g(pr, "harvestDensityPerHectare"), "Tablero Ciclo": None,
    }, static=False)

    print_concept("Dias de produccion", {
        "Piscinas Prod.": g(pp, "daysProduction"), "Siembras": None,
        "Cosechas x Fecha": g(co, "daysProduction"), "Precrias": g(pr, "daysProduction"), "Tablero Ciclo": None,
    }, static=False)

    days_cycle_pp = ((g(pp, "daysProduction") or 0) + (g(pp, "daysDry") or 0)) if pp else None
    print_concept("Dias de ciclo", {
        "Piscinas Prod.": days_cycle_pp, "Siembras": None,
        "Cosechas x Fecha": g(co, "daysCycle"), "Precrias": g(pr, "daysCycle"), "Tablero Ciclo": None,
    }, static=False)

    ultima_surv = ct.get("ultima_sobrevivencia")
    print_concept("Sobrevivencia (%)", {
        "Piscinas Prod.": g(pp, "estimatedSurvival"), "Siembras": None,
        "Cosechas x Fecha": None, "Precrias": g(pr, "finalSurvival"),
        "Tablero Ciclo": g(ultima_surv, "averageSurvival"),
    }, static=False)

    print_concept("Alimento acumulado (kg)", {
        "Piscinas Prod.": g(pp, "totalFeeding"), "Siembras": None,
        "Cosechas x Fecha": None, "Precrias": g(pr, "accumulatedFeed"),
        "Tablero Ciclo": ct.get("alimento_total"),
    }, static=False)

    print_concept("FCA real", {
        "Piscinas Prod.": g(pp, "growthFactor"), "Siembras": None,
        "Cosechas x Fecha": None, "Precrias": g(pr, "realFCR"), "Tablero Ciclo": None,
    }, static=False)

    print("\n--- Movimientos de esta piscina en el rango ---")
    if entradas:
        print(f"Entradas ({len(entradas)}):")
        for m in entradas:
            print(f"  {m['sourceTransactionDate'][:10]}  {m['type']:<20}  qty={m['quantity']:,.0f}  origen={m.get('sourceSubsidiaryName')}/{m.get('sourcePoolName')}")
    if salidas:
        print(f"Salidas ({len(salidas)}):")
        for m in salidas:
            print(f"  {m['sourceTransactionDate'][:10]}  {m['type']:<20}  qty={m['quantity']:,.0f}  destino={m.get('destinationSubsidiaryName')}/{m.get('destinationPoolName')}")
    if not entradas and not salidas:
        print("(ninguno en el rango de fechas consultado)")

    print(f"\ncycleId resuelto: {cycle_id}")
    if ct.get("n_registros_alimento") is not None:
        print(f"Registros de alimentacion en tablero Ciclo: {ct['n_registros_alimento']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sucursal", required=True, help="Codigo (A1, CA, ...) o id numerico de sucursal")
    ap.add_argument("--piscina", required=True, help="Nombre de la piscina (ej. 0454, 113, 030B)")
    ap.add_argument("--ciclo", required=True, type=int, help="Numero de ciclo")
    ap.add_argument("--start", default=None)
    ap.add_argument("--end", default=None)
    ap.add_argument("--days-back", type=int, default=400)
    args = ap.parse_args()

    end = args.end or date.today().isoformat()
    start = args.start or (date.today() - timedelta(days=args.days_back)).isoformat()

    run(args.sucursal, args.piscina, args.ciclo, start, end)


if __name__ == "__main__":
    main()
