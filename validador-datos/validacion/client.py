"""
Cliente de autenticacion y fetch generico contra el gateway de AP1.
Reutiliza el patron de autenticacion de reporte_diario.py / reporte_inventario.py.
"""
import os
import sys
from datetime import datetime

import requests

LOGIN_URL        = "https://gateway.naturisa.com.ec/bff/web/ap1/security/api/auth"
BASE             = "https://gateway.naturisa.com.ec/bff/web/ap1/backoffice/api"
USUARIO          = os.environ.get("NATURISA_USUARIO", "jparraga")
PASSWORD         = os.environ.get("NATURISA_PASSWORD", "Naturisa2025")
CODE_APPLICATION = "55ab9cb4-c887-4f42-98ec-b90470be6613"

# Lista de sucursales activas capturada del Network tab (jul/2026).
SUBSIDIARY_IDS = [13, 28, 6, 19, 8, 7, 10034, 11, 14, 17, 16, 15, 5, 4, 18, 21, 9, 10, 3, 1, 2, 12, 20, 10033]


def obtener_token() -> str:
    try:
        r = requests.post(LOGIN_URL, json={
            "userName":        USUARIO,
            "password":        PASSWORD,
            "codeApplication": CODE_APPLICATION,
            "includeUserInfo": True,
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
            print(f"[{datetime.now():%H:%M:%S}] Login OK ({USUARIO})")
            return token

        print("Login OK pero no se encontro el token en la respuesta.")
        sys.exit(1)

    except Exception as e:
        print(f"Login fallo: {e}")
        sys.exit(1)


class ApiClient:
    """Envuelve el token y expone un GET generico contra /bff/web/ap1/backoffice/api/..."""

    def __init__(self):
        self.token = obtener_token()

    def get(self, path: str, params: dict = None) -> dict:
        url = f"{BASE}/{path.lstrip('/')}"
        headers = {"Authorization": self.token if self.token.startswith("Bearer") else f"Bearer {self.token}"}
        r = requests.get(url, params=params, headers=headers, timeout=30)
        r.raise_for_status()
        return r.json()

    def subsidiary_params(self) -> list:
        return [("subsidiaryIds", i) for i in SUBSIDIARY_IDS]

    def subsidiary_map(self) -> dict:
        """code (A1, BR, ...) -> {id, name}. Se resuelve una sola vez y se cachea."""
        if getattr(self, "_sub_map", None) is not None:
            return self._sub_map
        params = self.subsidiary_params() + [
            ("minProductionDays", 0), ("maxProductionDays", 9999),
            ("minWeightGrams", 0), ("maxWeightGrams", 9999),
            ("stages", 1), ("stages", 2), ("stages", 3),
            ("cycleUsageIds", 7), ("usesTypes", "PRECRIADERO"), ("usesTypes", "ENGORDE"),
            ("status", "ACTIVO"), ("PageSize", 1000),
            ("cutOffYear", _current_year_week()[0]), ("cutOffWeek", _current_year_week()[1]),
            ("cycleUsageId", 7), ("stage", 1), ("stage", 2), ("stage", 3),
        ]
        data = self.get("report_production/summary", params=params)["data"]
        self._sub_map = {
            r["subsidiaryCode"]: {"id": r["subsidiaryId"], "name": r["subsidiaryName"]}
            for r in data
        }
        return self._sub_map

    def resolve_subsidiary_id(self, code_or_id) -> int:
        if isinstance(code_or_id, int) or str(code_or_id).isdigit():
            return int(code_or_id)
        entry = self.subsidiary_map().get(str(code_or_id).upper())
        if not entry:
            raise ValueError(f"Sucursal desconocida: {code_or_id}")
        return entry["id"]


def _current_year_week():
    from datetime import date
    iso = date.today().isocalendar()
    return iso[0], iso[1]
