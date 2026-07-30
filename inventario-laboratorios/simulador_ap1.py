"""
Simulador AP1 - Calculadora de fórmulas de producción
"""

import tkinter as tk
import os

KG_A_LB = 2.20462


class App(tk.Tk):
    # ── Paleta Naturisa AP1 ──────────────────────────────────────────────────
    C_BG        = "#EEF2F7"
    C_CARD      = "#FFFFFF"
    C_PANEL     = "#1F3864"
    C_ACCENT    = "#1F3864"
    C_BLUE      = "#2E75B6"
    C_TEXT      = "#1A2535"
    C_SUB       = "#5A7A9A"
    C_BORDER    = "#C8D8E8"
    C_INPUT     = "#F5F9FD"
    C_INPUT_FOCUS = "#2E75B6"
    C_ERR       = "#C0392B"
    C_RESULT_BG = "#F0F6FC"
    C_RESULT_ACCENT = "#2E75B6"

    def __init__(self):
        super().__init__()
        self.title("Simulador AP1")
        self.resizable(False, False)
        self.configure(bg=self.C_BG)
        try:
            ico = os.path.join(os.path.dirname(__file__), "AP1.ico")
            self.iconbitmap(ico)
        except Exception:
            pass
        self._build()
        self._centrar()

    def _build(self):
        wrap = tk.Frame(self, bg=self.C_BG)
        wrap.pack(padx=14, pady=14)

        # ── Header ───────────────────────────────────────────────────────────
        hdr = tk.Frame(wrap, bg=self.C_BG)
        hdr.pack(fill="x", pady=(0, 8))

        tk.Frame(hdr, bg=self.C_BLUE, width=3, height=20).pack(side="left", padx=(0, 8))

        title_row = tk.Frame(hdr, bg=self.C_BG)
        title_row.pack(side="left")
        tk.Label(title_row, text="AP1", bg=self.C_BG, fg=self.C_ACCENT,
                 font=("Segoe UI", 12, "bold")).pack(side="left")
        tk.Label(title_row, text=" SIMULADOR", bg=self.C_BG, fg=self.C_BLUE,
                 font=("Segoe UI", 12, "bold")).pack(side="left")

        # ── Tarjeta principal ───────────────────────────────────────────────
        card = tk.Frame(wrap, bg=self.C_CARD, highlightthickness=0)
        card.pack(fill="x")
        self._shadow(card)

        content = tk.Frame(card, bg=self.C_CARD)
        content.pack(fill="x", padx=14, pady=12)

        # Badge de fórmula
        badge = tk.Frame(content, bg=self.C_RESULT_BG)
        badge.pack(fill="x", pady=(0, 10))
        tk.Label(badge, text="FCA", bg=self.C_RESULT_BG, fg=self.C_BLUE,
                 font=("Segoe UI", 8, "bold")).pack(side="left", padx=(8, 4), pady=5)
        tk.Label(badge, text="Factor de Conversión Alimenticio", bg=self.C_RESULT_BG,
                 fg=self.C_TEXT, font=("Segoe UI", 7)).pack(side="left", pady=5)

        self._alim_precria = tk.StringVar()
        self._alim_preengorde = tk.StringVar()
        self._alim_acumulado = tk.StringVar()
        self._bio_inicial = tk.StringVar()
        self._bio_actual = tk.StringVar()

        for var in (self._alim_precria, self._alim_preengorde, self._alim_acumulado,
                    self._bio_inicial, self._bio_actual):
            var.trace_add("write", lambda *_: self._calcular())

        self._mk_input(content, "Alimento precriadero (kg)", self._alim_precria)
        self._mk_input(content, "Alimento preengorde (kg)", self._alim_preengorde)
        self._mk_input(content, "Alimento acumulado engorde (kg)", self._alim_acumulado)
        self._mk_input(content, "Biomasa inicial (lb)", self._bio_inicial)
        self._mk_input(content, "Biomasa actual (lb)", self._bio_actual)

        # ── Tarjetas de resultado ────────────────────────────────────────────
        self._resultados = {}
        for key, titulo in (
            ("bruto", "FCA BRUTO"),
            ("real", "FCA REAL"),
            ("larva", "FCA DESDE LARVA"),
        ):
            row = tk.Frame(content, bg=self.C_RESULT_BG)
            row.pack(fill="x", pady=(0, 6))

            tk.Label(row, text=titulo, bg=self.C_RESULT_BG, fg=self.C_SUB,
                     font=("Segoe UI", 7, "bold")).pack(side="left", padx=(10, 0), pady=8)

            lbl_val = tk.Label(row, text="—", bg=self.C_RESULT_BG, fg=self.C_RESULT_ACCENT,
                               font=("Segoe UI", 11, "bold"))
            lbl_val.pack(side="right", padx=(0, 10), pady=6)

            self._resultados[key] = lbl_val

        self._lbl_msg = tk.Label(content, text="Completa los datos para calcular",
                                 bg=self.C_CARD, fg=self.C_SUB,
                                 font=("Segoe UI", 7), anchor="w")
        self._lbl_msg.pack(fill="x", pady=(2, 0))

    # ── Helpers de construcción ───────────────────────────────────────────────
    def _shadow(self, card):
        tk.Frame(card, bg=self.C_BORDER, height=1).pack(fill="x", side="bottom")
        card.configure(highlightbackground=self.C_BORDER, highlightthickness=1)

    def _mk_input(self, parent, label, var):
        tk.Label(parent, text=label, bg=self.C_CARD, fg=self.C_TEXT,
                 font=("Segoe UI", 7, "bold")).pack(anchor="w", pady=(0, 2))

        box = tk.Frame(parent, bg=self.C_INPUT,
                       highlightbackground=self.C_BORDER, highlightcolor=self.C_INPUT_FOCUS,
                       highlightthickness=1)
        box.pack(fill="x", pady=(0, 8))

        entry = tk.Entry(box, textvariable=var, font=("Segoe UI", 8),
                         bg=self.C_INPUT, fg=self.C_TEXT, relief="flat",
                         insertbackground=self.C_ACCENT, width=26)
        entry.pack(fill="x", ipady=5, padx=8)

        entry.bind("<FocusIn>", lambda e: box.configure(highlightbackground=self.C_INPUT_FOCUS,
                                                         highlightthickness=1))
        entry.bind("<FocusOut>", lambda e: box.configure(highlightbackground=self.C_BORDER))

    # ── Cálculos ──────────────────────────────────────────────────────────────
    def _leer(self, var):
        txt = var.get().strip().replace(",", ".")
        if not txt:
            return None
        try:
            return float(txt)
        except ValueError:
            return None

    def _calcular(self):
        # Alimento ingresado en kg -> convertido a libras para calcular con la biomasa (lb)
        precria_lb = self._leer(self._alim_precria)
        preengorde_lb = self._leer(self._alim_preengorde)
        acumulado_lb = self._leer(self._alim_acumulado)
        bio_inicial = self._leer(self._bio_inicial)
        bio_actual = self._leer(self._bio_actual)

        precria_lb = precria_lb * KG_A_LB if precria_lb is not None else None
        preengorde_lb = preengorde_lb * KG_A_LB if preengorde_lb is not None else None
        acumulado_lb = acumulado_lb * KG_A_LB if acumulado_lb is not None else None

        hay_error = False

        # FCA Bruto = alimento acumulado / biomasa actual
        if acumulado_lb is not None and bio_actual is not None:
            if bio_actual > 0:
                self._resultados["bruto"].configure(
                    text=f"{acumulado_lb / bio_actual:.2f}", fg=self.C_RESULT_ACCENT)
            else:
                self._resultados["bruto"].configure(text="⚠", fg=self.C_ERR)
                hay_error = True
        else:
            self._resultados["bruto"].configure(text="—", fg=self.C_SUB)

        # FCA Real = alimento acumulado / (biomasa actual - biomasa inicial)
        if acumulado_lb is not None and bio_actual is not None and bio_inicial is not None:
            ganancia = bio_actual - bio_inicial
            if ganancia > 0:
                self._resultados["real"].configure(
                    text=f"{acumulado_lb / ganancia:.2f}", fg=self.C_RESULT_ACCENT)
            else:
                self._resultados["real"].configure(text="⚠", fg=self.C_ERR)
                hay_error = True
        else:
            self._resultados["real"].configure(text="—", fg=self.C_SUB)

        # FCA desde Larva = (precriadero + preengorde + acumulado) / biomasa actual
        if ((precria_lb is not None or preengorde_lb is not None)
                and acumulado_lb is not None and bio_actual is not None):
            if bio_actual > 0:
                total = (precria_lb or 0) + (preengorde_lb or 0) + acumulado_lb
                self._resultados["larva"].configure(
                    text=f"{total / bio_actual:.2f}", fg=self.C_RESULT_ACCENT)
            else:
                self._resultados["larva"].configure(text="⚠", fg=self.C_ERR)
                hay_error = True
        else:
            self._resultados["larva"].configure(text="—", fg=self.C_SUB)

        if hay_error:
            self._lbl_msg.configure(text="⚠  Revisa los valores ingresados", fg=self.C_ERR)
        else:
            self._lbl_msg.configure(text="Completa los datos para calcular", fg=self.C_SUB)

    def _centrar(self):
        self.update_idletasks()
        w = self.winfo_width()
        h = self.winfo_height()
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")


if __name__ == "__main__":
    App().mainloop()
