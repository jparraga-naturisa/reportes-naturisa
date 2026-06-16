"""
Reporte Saldos de Inventario - Naturisa Labs
Genera Excel por cada Larviquest con ciclo activo
Formato: Material | Descripcion | U/M | Stock SAP | Stock Lab | Consumos no Enviados | Diferencias
"""

import requests
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime, date
import os, sys, json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders

# -------------------------------------------------------------
# CONFIGURACION
# -------------------------------------------------------------
import os
LOGIN_URL        = "https://gateway.naturisa.com.ec/bff/web/ap1/security/api/auth"
USUARIO          = os.environ.get("NATURISA_USUARIO", "jparraga")
PASSWORD         = os.environ.get("NATURISA_PASSWORD", "Naturisa2025")
CODE_APPLICATION = os.environ.get("NATURISA_CODE_APP", "55ab9cb4-c887-4f42-98ec-b90470be6613")

SUBSIDIARIAS = {
    23: "Larviquest 1",
    24: "Larviquest 2",
    25: "Larviquest 3",
    26: "Larviquest 4",
}

OUTPUT_DIR = "/tmp/reportes_naturisa" if not os.name == "nt" else r"C:\Reportes\Naturisa"

CORREO_REMITENTE    = os.environ.get("GMAIL_USER", "parragajonathan965@gmail.com")
PASSWORD_CORREO     = os.environ.get("GMAIL_PASSWORD", "")
CORREO_DESTINATARIO = ["jparraga@naturisa.com.ec", "asanlucas@naturisa.com.ec", "jlafuente@naturisa.com.ec", "jvillavicencio@naturisa.com.ec", "rmaspons@naturisa.com.ec"]
SMTP_SERVER         = "smtp.gmail.com"
SMTP_PORT           = 587
# -------------------------------------------------------------

BASE     = "https://gateway.naturisa.com.ec"
LAB_BASE = f"{BASE}/bff/web/lab/backoffice/api"


def obtener_token() -> str:
    try:
        r = requests.post(LOGIN_URL, json={
            "userName":        USUARIO,
            "password":        PASSWORD,
            "codeApplication": CODE_APPLICATION,
            "includeUserInfo": True
        }, timeout=15)
        r.raise_for_status()
        data = r.json()
        token = (data.get("token") or data.get("accessToken") or
                 data.get("access_token") or data.get("jwt") or
                 data.get("bearerToken"))
        if not token and isinstance(data, dict):
            for v in data.values():
                if isinstance(v, dict):
                    token = (v.get("token") or v.get("accessToken") or
                             v.get("access_token") or v.get("jwt"))
                    if token:
                        break
        if token:
            print(f"[{datetime.now():%H:%M:%S}] Login OK")
            return token
        print("No se encontro el token.")
        sys.exit(1)
    except Exception as e:
        print(f"Login fallo: {e}")
        sys.exit(1)


def obtener_ciclo_activo(token: str, subsidiary_id: int) -> dict:
    url = (f"{LAB_BASE}/cycle?PageNumber=1&PageSize=1000&OrderBy=code+desc"
           f"&subsidiaryId={subsidiary_id}&includeLaboratory=true&includeLarvalStage=true")
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    data = r.json()

    ciclos = []
    if isinstance(data, list):
        ciclos = data
    elif "data" in data:
        inner = data["data"]
        if isinstance(inner, list):
            ciclos = inner
        elif isinstance(inner, dict) and "data" in inner:
            ciclos = inner["data"]

    if ciclos:
        ciclo    = ciclos[0]
        cycle_id = ciclo.get("id") or ciclo.get("cycleId") or ciclo.get("idCycle")
        fecha_inicio = ciclo.get("sowingDate") or ciclo.get("dryDate") or date.today().strftime("%Y-%m-%d")
        if "T" in str(fecha_inicio):
            fecha_inicio = fecha_inicio.split("T")[0]
        print(f"  Ciclo ID: {cycle_id} | Fecha inicio: {fecha_inicio}")
        return {"cycle_id": cycle_id, "fecha_inicio": fecha_inicio}

    print(f"  Sin ciclo activo para subsidiaria {subsidiary_id}")
    return None


def obtener_inventario(token: str, subsidiary_id: int, cycle_id: int, fecha_inicio: str) -> list:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    todos   = []
    page    = 1

    while True:
        url = (f"{LAB_BASE}/warehouse_production"
               f"?subsidiaryId={subsidiary_id}"
               f"&cycleId={cycle_id}"
               f"&date={fecha_inicio}"
               f"&includeItem=true"
               f"&includeWarehouseOrigin=true"
               f"&PageSize=100"
               f"&PageNumber={page}")

        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()

        registros   = []
        total_pages = 1

        if isinstance(data, list):
            registros = data
        elif "data" in data:
            inner = data["data"]
            if isinstance(inner, list):
                registros = inner
            elif isinstance(inner, dict):
                registros   = inner.get("data", [])
                total_pages = inner.get("totalPages", 1)

        todos.extend(registros)
        if page >= total_pages or not registros:
            break
        page += 1

    return todos


def construir_tabla(registros: list) -> pd.DataFrame:
    rows = []
    for rec in registros:
        item           = rec.get("item", {})
        saldo_final    = rec.get("stockAvailable", 0) or 0
        consumo_nosync = rec.get("unsyncQuantity", 0) or 0
        saldo_sap      = saldo_final + consumo_nosync
        # Diferencia = Stock SAP - Stock Lab - Consumos no Enviados
        diferencia     = saldo_sap - saldo_final - consumo_nosync

        unidad = item.get("baseUnitMsrAb", "").upper()
        # Solo renombrar la unidad, NO multiplicar (la API ya devuelve en la unidad correcta)
        unidad_lab = "G" if unidad in ("KG", "KGS") else ("ML" if unidad == "L" else unidad)

        rows.append({
            "Material":               item.get("codeSap", ""),
            "Descripcion":            item.get("name", ""),
            "Unidad Medida":          unidad_lab,
            "Stock SAP":              round(saldo_sap, 2),
            "Stock Laboratorio":      round(saldo_final, 2),
            "Consumos no Enviados":   round(consumo_nosync, 2),
            "Diferencias":            round(diferencia, 2),
        })

    return pd.DataFrame(rows).sort_values("Material").reset_index(drop=True)


def borde_celda():
    return Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC"),
    )


def crear_excel(df: pd.DataFrame, fecha: str, nombre_sub: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    nombre_archivo = nombre_sub.replace(" ", "_")
    ruta = os.path.join(OUTPUT_DIR, f"Inventario_{nombre_archivo}_{fecha}.xlsx")

    wb = Workbook()
    ws = wb.active
    ws.title = "Saldos Inventario"
    borde = borde_celda()

    GRIS_OSC  = "2F2F2F"
    GRIS_MED  = "595959"
    AZUL_CLAR = "EBF3FB"
    BLANCO    = "FFFFFF"
    ROJO_CLAR = "FFE0E0"
    ROJO_FONT = "C00000"

    columnas  = list(df.columns)
    n_cols    = len(columnas)
    ult_letra = get_column_letter(n_cols)

    # Titulo
    ws.merge_cells(f"A1:{ult_letra}1")
    ws["A1"] = f"Saldos de Inventario — {nombre_sub} — {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    ws["A1"].font      = Font(bold=True, color="FFFFFF", size=12, name="Arial")
    ws["A1"].fill      = PatternFill("solid", fgColor=GRIS_OSC)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 26

    # Encabezados — nombres como en el Excel de referencia
    encabezados = {
        "Material":             "Material",
        "Descripcion":          "Descripción del material",
        "Unidad Medida":        "Unidad\nMedida",
        "Stock SAP":            "Stock\nSAP",
        "Stock Laboratorio":    "Stock\nLaboratorio",
        "Consumos no Enviados": "Consumos no\nEnviados",
        "Diferencias":          "Diferencias",
    }
    for ci, col in enumerate(columnas, 1):
        c = ws.cell(row=2, column=ci, value=encabezados.get(col, col))
        c.font      = Font(bold=True, color="FFFFFF", name="Arial", size=10)
        c.fill      = PatternFill("solid", fgColor=GRIS_MED)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border    = borde
    ws.row_dimensions[2].height = 30

    # Datos
    col_dif_idx = columnas.index("Diferencias") + 1
    for ri, row in enumerate(df.itertuples(index=False), 3):
        dif_val     = row[col_dif_idx - 1]
        fill_normal = PatternFill("solid", fgColor=AZUL_CLAR if ri % 2 == 0 else BLANCO)
        for ci, val in enumerate(row, 1):
            c = ws.cell(row=ri, column=ci, value=val)
            c.border = borde
            if ci == col_dif_idx and dif_val != 0:
                c.fill = PatternFill("solid", fgColor=ROJO_CLAR)
                c.font = Font(name="Arial", size=10, bold=True, color=ROJO_FONT)
            else:
                c.fill = fill_normal
                c.font = Font(name="Arial", size=10)
            if ci <= 2:
                c.alignment = Alignment(horizontal="left", vertical="center")
            else:
                c.alignment = Alignment(horizontal="center", vertical="center")
                if ci > 3 and isinstance(val, (int, float)):
                    c.number_format = "#,##0.00"

    # Totales
    ult_dato = 2 + len(df)
    fila_tot = ult_dato + 1
    cols_sum = ["Stock SAP","Stock Laboratorio","Consumos no Enviados","Diferencias"]
    for ci, col_name in enumerate(columnas, 1):
        letra = get_column_letter(ci)
        c = ws.cell(row=fila_tot, column=ci)
        c.border = borde
        c.alignment = Alignment(horizontal="center", vertical="center")
        if col_name == "Material":
            c.value = "TOTAL"
            c.font  = Font(bold=True, color="FFFFFF", name="Arial", size=10)
            c.fill  = PatternFill("solid", fgColor=GRIS_OSC)
        elif col_name in cols_sum:
            c.value = f"=SUM({letra}3:{letra}{ult_dato})"
            c.number_format = "#,##0.00"
            c.font  = Font(bold=True, color=ROJO_FONT if col_name == "Diferencias" else "FFFFFF",
                          name="Arial", size=10)
            c.fill  = PatternFill("solid", fgColor=GRIS_OSC)
        else:
            c.fill = PatternFill("solid", fgColor=GRIS_OSC)
            c.font = Font(name="Arial", size=10, color="FFFFFF")

    # Anchos
    anchos = {
        "Material": 12, "Descripcion": 45, "Unidad Medida": 10,
        "Stock SAP": 14, "Stock Laboratorio": 16,
        "Consumos no Enviados": 18, "Diferencias": 14
    }
    for ci, col_name in enumerate(columnas, 1):
        ws.column_dimensions[get_column_letter(ci)].width = anchos.get(col_name, 14)

    ws.freeze_panes = "D3"
    wb.save(ruta)
    return ruta


def tabla_html(df, nombre_sub: str) -> str:
    """Genera tabla HTML de un laboratorio. df puede ser None si no hay produccion."""
    abrev = nombre_sub.replace("Larviquest ", "LQ")

    if df is None:
        return f"""
    <div style="margin-bottom:24px;">
      <div style="background:#2F2F2F; padding:8px 14px; border-radius:4px 4px 0 0;">
        <b style="color:#FFFFFF; font-size:13px;">{abrev}</b>
      </div>
      <div style="border:1px solid #ddd; border-top:none; padding:14px 16px; background:#FAFAFA; border-radius:0 0 4px 4px;">
        <p style="margin:0; font-size:13px; color:#888; font-style:italic;">
          &#128274; Ciclo en fase de secado — sin produccion activa
        </p>
      </div>
    </div>"""
    filas = ""
    for i, (_, row) in enumerate(df.iterrows()):
        bg = "#F5F5F5" if i % 2 == 0 else "#FFFFFF"
        dif = row["Diferencias"]
        color_dif = f'color:#C00000; font-weight:bold;' if dif != 0 else ''
        filas += f"""
        <tr style="background:{bg};">
            <td style="padding:4px 8px; border:1px solid #ddd;">{row["Material"]}</td>
            <td style="padding:4px 8px; border:1px solid #ddd;">{row["Descripcion"]}</td>
            <td style="padding:4px 8px; border:1px solid #ddd; text-align:center;">{row["Unidad Medida"]}</td>
            <td style="padding:4px 8px; border:1px solid #ddd; text-align:right;">{row["Stock SAP"]:,.2f}</td>
            <td style="padding:4px 8px; border:1px solid #ddd; text-align:right;">{row["Stock Laboratorio"]:,.2f}</td>
            <td style="padding:4px 8px; border:1px solid #ddd; text-align:right;">{row["Consumos no Enviados"]:,.2f}</td>
            <td style="padding:4px 8px; border:1px solid #ddd; text-align:right; {color_dif}">{dif:,.2f}</td>
        </tr>"""

    # Fila de totales
    filas += f"""
        <tr style="background:#2F2F2F; color:#FFFFFF; font-weight:bold;">
            <td colspan="3" style="padding:5px 8px; border:1px solid #555; text-align:center;">TOTAL</td>
            <td style="padding:5px 8px; border:1px solid #555; text-align:right;">{df["Stock SAP"].sum():,.2f}</td>
            <td style="padding:5px 8px; border:1px solid #555; text-align:right;">{df["Stock Laboratorio"].sum():,.2f}</td>
            <td style="padding:5px 8px; border:1px solid #555; text-align:right;">{df["Consumos no Enviados"].sum():,.2f}</td>
            <td style="padding:5px 8px; border:1px solid #555; text-align:right; color:#FF9999;">{df["Diferencias"].sum():,.2f}</td>
        </tr>"""

    return f"""
    <div style="margin-bottom:30px;">
      <div style="background:#2F2F2F; padding:8px 14px; border-radius:4px 4px 0 0;">
        <b style="color:#FFFFFF; font-size:13px;">{abrev}</b>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #ddd; border-top:none;">
        <thead>
          <tr style="background:#595959; color:#FFFFFF;">
            <th style="padding:6px 8px; border:1px solid #444;">Material</th>
            <th style="padding:6px 8px; border:1px solid #444;">Descripción del material</th>
            <th style="padding:6px 8px; border:1px solid #444;">UM</th>
            <th style="padding:6px 8px; border:1px solid #444;">Stock SAP</th>
            <th style="padding:6px 8px; border:1px solid #444;">Stock Laboratorio</th>
            <th style="padding:6px 8px; border:1px solid #444;">Consumos no Enviados</th>
            <th style="padding:6px 8px; border:1px solid #444;">Diferencias</th>
          </tr>
        </thead>
        <tbody>{filas}</tbody>
      </table>
    </div>"""


def enviar_correo(tablas_data: list, fecha: str):
    """Envia correo con tablas en el cuerpo del correo."""
    try:
        print(f"[{datetime.now():%H:%M:%S}] Enviando correo...")
        msg = MIMEMultipart()
        msg["From"]    = CORREO_REMITENTE
        msg["To"]      = ", ".join(CORREO_DESTINATARIO)
        msg["Subject"] = f"Control de Bodegas de Produccion Laboratorios — {fecha}"

        tablas_html = "".join(tabla_html(df, nombre) for df, nombre in tablas_data)

        cuerpo = f"""
<div style="font-family:Arial, sans-serif;">
  <div style="background:#1a1a2e; padding:14px 20px; border-radius:6px 6px 0 0; margin-bottom:20px;">
    <h2 style="color:#FFFFFF; margin:0; font-size:15px; letter-spacing:1px;">
      CONTROL DE BODEGAS DE PRODUCCION LABORATORIOS
    </h2>
    <p style="color:#aaa; margin:4px 0 0; font-size:12px;">Fecha: {fecha}</p>
  </div>
  {tablas_html}
  <p style="font-size:11px; color:#999; margin-top:10px; text-align:center;">
    <i>Este correo fue generado automaticamente por el sistema de reportes Naturisa.</i>
  </p>
</div>"""

        msg.attach(MIMEText(cuerpo, "html"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as servidor:
            servidor.ehlo()
            servidor.starttls()
            servidor.login(CORREO_REMITENTE, PASSWORD_CORREO)
            servidor.sendmail(CORREO_REMITENTE, CORREO_DESTINATARIO, msg.as_string())

        print(f"[{datetime.now():%H:%M:%S}] Correo enviado a {CORREO_DESTINATARIO}")

    except Exception as e:
        print(f"Error al enviar correo: {e}")


def main():
    fecha = date.today().strftime("%Y-%m-%d")
    print(f"[{datetime.now():%H:%M:%S}] Reporte Inventario Naturisa — {fecha}")

    try:
        token = obtener_token()

        rutas_generadas = []
        tablas_data = []

        for sub_id, sub_nombre in SUBSIDIARIAS.items():
            print(f"\n--- {sub_nombre} (ID: {sub_id}) ---")

            ciclo = obtener_ciclo_activo(token, sub_id)
            if not ciclo:
                print(f"  {sub_nombre} — sin ciclo activo")
                tablas_data.append((None, sub_nombre))
                continue

            registros = obtener_inventario(token, sub_id, ciclo["cycle_id"], ciclo["fecha_inicio"])
            if not registros:
                print(f"  Sin registros para {sub_nombre} — ciclo en seco")
                tablas_data.append((None, sub_nombre))
                continue

            print(f"  {len(registros)} productos recibidos")
            df   = construir_tabla(registros)
            ruta = crear_excel(df, fecha, sub_nombre)
            rutas_generadas.append(ruta)
            tablas_data.append((df, sub_nombre))
            print(f"  Reporte generado: {ruta}")

            con_diff = df[df["Diferencias"] != 0]
            if con_diff.empty:
                print(f"  Sin diferencias")
            else:
                print(f"  {len(con_diff)} productos con diferencia")

        print(f"\n[{datetime.now():%H:%M:%S}] Proceso completado.")

        # Siempre enviar correo con todos los laboratorios
        enviar_correo(tablas_data, fecha)

    except requests.HTTPError as e:
        print(f"Error HTTP {e.response.status_code}: {e.response.text[:300]}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
