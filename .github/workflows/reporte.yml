name: Reporte Inventario Naturisa

on:
  schedule:
    - cron: '0 23 * * *'  # 18:00 Ecuador (UTC-5) = 23:00 UTC
  workflow_dispatch:       # permite ejecutar manualmente

jobs:
  generar-reporte:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout codigo
        uses: actions/checkout@v4

      - name: Instalar Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Instalar dependencias
        run: pip install requests pandas openpyxl

      - name: Ejecutar reporte
        env:
          NATURISA_USUARIO:    ${{ secrets.NATURISA_USUARIO }}
          NATURISA_PASSWORD:   ${{ secrets.NATURISA_PASSWORD }}
          NATURISA_CODE_APP:   ${{ secrets.NATURISA_CODE_APP }}
          GMAIL_USER:          ${{ secrets.GMAIL_USER }}
          GMAIL_PASSWORD:      ${{ secrets.GMAIL_PASSWORD }}
        run: python reporte_inventario.py
