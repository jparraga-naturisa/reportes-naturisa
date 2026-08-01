"""
Simulador AP1 - Calculadora de fórmulas de producción
"""

import tkinter as tk
from tkinter import ttk
import os

KG_A_LB = 2.20462

COEF_ALIMENTO = {
    "conservador": (0.857272, -0.512),
    "normal":      (0.805280, -0.5355),
    "agresivo":    (0.756540, -0.559),
}


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
        wrap.pack(padx=8, pady=8)

        # ── Header ───────────────────────────────────────────────────────────
        hdr = tk.Frame(wrap, bg=self.C_BG)
        hdr.pack(fill="x", pady=(0, 4))

        tk.Frame(hdr, bg=self.C_BLUE, width=3, height=16).pack(side="left", padx=(0, 6))

        title_row = tk.Frame(hdr, bg=self.C_BG)
        title_row.pack(side="left")
        tk.Label(title_row, text="AP1", bg=self.C_BG, fg=self.C_ACCENT,
                 font=("Century Gothic", 10, "bold")).pack(side="left")
        tk.Label(title_row, text=" SIMULADOR", bg=self.C_BG, fg=self.C_BLUE,
                 font=("Century Gothic", 10, "bold")).pack(side="left")

        # ── Tarjeta principal ───────────────────────────────────────────────
        card = tk.Frame(wrap, bg=self.C_CARD, highlightthickness=0)
        card.pack(fill="x")
        self._shadow(card)

        # ── Selector de pestaña (desplegable) ────────────────────────────────
        self._tabs = {
            "FCA — Factor de Conversión Alimenticio": "fca",
            "ALIMENTO — Cálculo por Escenario": "alimento",
            "SOBREVIVENCIA — % de Animales Vivos": "sobrevivencia",
        }

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Sim.TCombobox",
                        fieldbackground=self.C_RESULT_BG, background=self.C_RESULT_BG,
                        foreground=self.C_BLUE, arrowcolor=self.C_BLUE,
                        borderwidth=0, relief="flat")

        sel_bar = tk.Frame(card, bg=self.C_CARD)
        sel_bar.pack(fill="x", padx=8, pady=(8, 0))

        self._tab_combo = ttk.Combobox(sel_bar, values=list(self._tabs.keys()),
                                       state="readonly", font=("Century Gothic", 7, "bold"),
                                       style="Sim.TCombobox")
        self._tab_combo.current(0)
        self._tab_combo.pack(fill="x", ipady=3)
        self._tab_combo.bind("<<ComboboxSelected>>", lambda e: self._switch_tab(
            self._tabs[self._tab_combo.get()]))

        # ── Contenedor de paneles ────────────────────────────────────────────
        self._content = tk.Frame(card, bg=self.C_CARD)
        self._content.pack(fill="x", padx=8, pady=8)

        self._panel_fca = tk.Frame(self._content, bg=self.C_CARD)
        self._build_fca(self._panel_fca)

        self._panel_alimento = tk.Frame(self._content, bg=self.C_CARD)
        self._build_alimento(self._panel_alimento)

        self._panel_sobrevivencia = tk.Frame(self._content, bg=self.C_CARD)
        self._build_sobrevivencia(self._panel_sobrevivencia)

        self._switch_tab("fca")

    def _switch_tab(self, tab):
        self._panel_fca.pack_forget()
        self._panel_alimento.pack_forget()
        self._panel_sobrevivencia.pack_forget()

        if tab == "fca":
            self._panel_fca.pack(fill="x")
        elif tab == "alimento":
            self._panel_alimento.pack(fill="x")
        else:
            self._panel_sobrevivencia.pack(fill="x")

    def _build_fca(self, content):
        self._alim_precria = tk.StringVar()
        self._anim_precria_piscina = tk.StringVar()
        self._anim_precria_total = tk.StringVar()

        self._alim_preengorde = tk.StringVar()
        self._anim_preengorde_piscina = tk.StringVar()
        self._anim_preengorde_total = tk.StringVar()

        self._alim_acumulado = tk.StringVar()
        self._bio_inicial = tk.StringVar()
        self._bio_actual = tk.StringVar()

        for var in (self._alim_precria, self._anim_precria_piscina, self._anim_precria_total,
                    self._alim_preengorde, self._anim_preengorde_piscina, self._anim_preengorde_total,
                    self._alim_acumulado, self._bio_inicial, self._bio_actual):
            var.trace_add("write", lambda *_: self._calcular())

        # ── Dos columnas: precriadero / preengorde ───────────────────────────
        cols = tk.Frame(content, bg=self.C_CARD)
        cols.pack(fill="x")
        cols.grid_columnconfigure(0, weight=1)
        cols.grid_columnconfigure(1, weight=1)

        col_precria = tk.Frame(cols, bg=self.C_CARD)
        col_precria.grid(row=0, column=0, sticky="new", padx=(0, 6))
        col_preengorde = tk.Frame(cols, bg=self.C_CARD)
        col_preengorde.grid(row=0, column=1, sticky="new", padx=(6, 0))

        self._mk_field_titulo(col_precria, "PRECRIADERO")
        self._mk_input(col_precria, "Alim. total (kg)", self._alim_precria, width=12)
        self._mk_input(col_precria, "Anim. piscina", self._anim_precria_piscina, width=12)
        self._mk_input(col_precria, "Anim. totales", self._anim_precria_total, width=12)

        self._mk_field_titulo(col_preengorde, "PREENGORDE")
        self._mk_input(col_preengorde, "Alim. total (kg)", self._alim_preengorde, width=12)
        self._mk_input(col_preengorde, "Anim. piscina", self._anim_preengorde_piscina, width=12)
        self._mk_input(col_preengorde, "Anim. totales", self._anim_preengorde_total, width=12)

        # ── Tres columnas: engorde / biomasa ──────────────────────────────────
        row2 = tk.Frame(content, bg=self.C_CARD)
        row2.pack(fill="x", pady=(4, 0))
        row2.grid_columnconfigure(0, weight=1)
        row2.grid_columnconfigure(1, weight=1)
        row2.grid_columnconfigure(2, weight=1)

        c1 = tk.Frame(row2, bg=self.C_CARD)
        c1.grid(row=0, column=0, sticky="new", padx=(0, 5))
        c2 = tk.Frame(row2, bg=self.C_CARD)
        c2.grid(row=0, column=1, sticky="new", padx=5)
        c3 = tk.Frame(row2, bg=self.C_CARD)
        c3.grid(row=0, column=2, sticky="new", padx=(5, 0))

        self._mk_input(c1, "Alim. engorde (kg)", self._alim_acumulado, width=10)
        self._mk_input(c2, "Biomasa ini. (lb)", self._bio_inicial, width=10)
        self._mk_input(c3, "Biomasa act. (lb)", self._bio_actual, width=10)

        # ── Tarjetas de resultado ────────────────────────────────────────────
        self._resultados = {}
        res_row = tk.Frame(content, bg=self.C_CARD)
        res_row.pack(fill="x", pady=(10, 0))
        res_row.grid_columnconfigure(0, weight=1)
        res_row.grid_columnconfigure(1, weight=1)
        res_row.grid_columnconfigure(2, weight=1)

        for i, (key, titulo) in enumerate((
            ("bruto", "BRUTO"),
            ("real", "REAL"),
            ("larva", "LARVA"),
        )):
            box = tk.Frame(res_row, bg=self.C_RESULT_BG)
            box.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 4, 0 if i == 2 else 4))

            tk.Label(box, text=titulo, bg=self.C_RESULT_BG, fg=self.C_SUB,
                     font=("Century Gothic", 7, "bold")).pack(pady=(8, 0))

            lbl_val = tk.Label(box, text="—", bg=self.C_RESULT_BG, fg=self.C_RESULT_ACCENT,
                               font=("Century Gothic", 13, "bold"))
            lbl_val.pack(pady=(0, 8))

            self._resultados[key] = lbl_val

        self._lbl_msg = tk.Label(content, text="",
                                 bg=self.C_CARD, fg=self.C_ERR,
                                 font=("Century Gothic", 7), anchor="w")
        self._lbl_msg.pack(fill="x", pady=(6, 0))

    def _build_alimento(self, content):
        # ── Selector de escenario ─────────────────────────────────────────────
        self._escenario = tk.StringVar(value="normal")
        self._escenario_btns = {}

        sel = tk.Frame(content, bg=self.C_CARD)
        sel.pack(fill="x", pady=(0, 8))
        sel.grid_columnconfigure(0, weight=1)
        sel.grid_columnconfigure(1, weight=1)
        sel.grid_columnconfigure(2, weight=1)

        for i, (key, titulo) in enumerate((
            ("conservador", "CONSERVADOR"),
            ("normal", "NORMAL"),
            ("agresivo", "AGRESIVO"),
        )):
            btn = tk.Button(sel, text=titulo, command=lambda k=key: self._elegir_escenario(k),
                            font=("Century Gothic", 7, "bold"), relief="flat",
                            cursor="hand2", bd=0, pady=8)
            btn.grid(row=0, column=i, sticky="ew", padx=(0 if i == 0 else 3, 0 if i == 2 else 3))
            self._escenario_btns[key] = btn

        # ── Inputs ────────────────────────────────────────────────────────────
        self._peso = tk.StringVar()
        self._densidad = tk.StringVar()
        self._ha = tk.StringVar()

        row = tk.Frame(content, bg=self.C_CARD)
        row.pack(fill="x")
        row.grid_columnconfigure(0, weight=1)
        row.grid_columnconfigure(1, weight=1)
        row.grid_columnconfigure(2, weight=1)

        c1 = tk.Frame(row, bg=self.C_CARD)
        c1.grid(row=0, column=0, sticky="new", padx=(0, 5))
        c2 = tk.Frame(row, bg=self.C_CARD)
        c2.grid(row=0, column=1, sticky="new", padx=5)
        c3 = tk.Frame(row, bg=self.C_CARD)
        c3.grid(row=0, column=2, sticky="new", padx=(5, 0))

        self._mk_input(c1, "Peso (g)", self._peso, width=10)
        self._mk_input(c2, "Densidad (anim/m²)", self._densidad, width=10)
        self._mk_input(c3, "Ha", self._ha, width=10)

        for var in (self._peso, self._densidad, self._ha):
            var.trace_add("write", lambda *_: self._calcular_alimento())

        # ── Resultado ─────────────────────────────────────────────────────────
        res = tk.Frame(content, bg=self.C_RESULT_BG)
        res.pack(fill="x", pady=(10, 0))

        tk.Label(res, text="ALIMENTO / DÍA (kg)", bg=self.C_RESULT_BG, fg=self.C_SUB,
                 font=("Century Gothic", 7, "bold")).pack(pady=(10, 0))
        self._lbl_alim_valor = tk.Label(res, text="—", bg=self.C_RESULT_BG, fg=self.C_RESULT_ACCENT,
                                        font=("Century Gothic", 18, "bold"))
        self._lbl_alim_valor.pack(pady=(2, 2))
        self._lbl_alim_sub = tk.Label(res, text="", bg=self.C_RESULT_BG, fg=self.C_TEXT,
                                      font=("Century Gothic", 7))
        self._lbl_alim_sub.pack(pady=(0, 10))

        self._lbl_alim_msg = tk.Label(content, text="",
                                      bg=self.C_CARD, fg=self.C_ERR,
                                      font=("Century Gothic", 7), anchor="w")
        self._lbl_alim_msg.pack(fill="x", pady=(6, 0))

        self._marcar_escenario()

    def _elegir_escenario(self, key):
        self._escenario.set(key)
        self._marcar_escenario()
        self._calcular_alimento()

    def _marcar_escenario(self):
        for key, btn in self._escenario_btns.items():
            if key == self._escenario.get():
                btn.configure(bg=self.C_BLUE, fg="#FFFFFF",
                             activebackground=self.C_BLUE, activeforeground="#FFFFFF")
            else:
                btn.configure(bg=self.C_INPUT, fg=self.C_SUB,
                             activebackground=self.C_INPUT, activeforeground=self.C_SUB)

    def _calcular_alimento(self):
        peso = self._leer(self._peso)
        densidad = self._leer(self._densidad)
        ha = self._leer(self._ha)

        if peso is None or densidad is None or ha is None:
            self._lbl_alim_valor.configure(text="—", fg=self.C_SUB)
            self._lbl_alim_sub.configure(text="")
            self._lbl_alim_msg.configure(text="")
            return

        if peso <= 0:
            self._lbl_alim_valor.configure(text="⚠", fg=self.C_ERR)
            self._lbl_alim_sub.configure(text="")
            self._lbl_alim_msg.configure(text="⚠  El peso debe ser mayor a 0")
            return

        a, b = COEF_ALIMENTO[self._escenario.get()]
        fa = a * (peso ** b)
        alim_ha_dia_kg = densidad / fa
        alim_dia_kg = alim_ha_dia_kg * ha

        self._lbl_alim_valor.configure(text=f"{alim_dia_kg:,.2f}", fg=self.C_RESULT_ACCENT)
        self._lbl_alim_sub.configure(text=f"{alim_ha_dia_kg:,.2f} kg/Ha/día")
        self._lbl_alim_msg.configure(text="")

    def _build_sobrevivencia(self, content):
        self._sob_ha = tk.StringVar()
        self._sob_sembrados = tk.StringVar()
        self._sob_actuales = tk.StringVar()
        self._sob_sembrados_ha = tk.StringVar()
        self._sob_actuales_ha = tk.StringVar()
        self._sob_sembrados_m2 = tk.StringVar()
        self._sob_actuales_m2 = tk.StringVar()

        # ── Ha (fila completa) ────────────────────────────────────────────────
        self._mk_input(content, "Ha", self._sob_ha, width=26)

        # ── Filas de 2 columnas ───────────────────────────────────────────────
        for izq_label, izq_var, der_label, der_var in (
            ("Animales sembrados", self._sob_sembrados, "Animales actuales", self._sob_actuales),
            ("Animales sembra Ha", self._sob_sembrados_ha, "Animales actuales Ha", self._sob_actuales_ha),
            ("Animales sembra m²", self._sob_sembrados_m2, "Animales actuales m²", self._sob_actuales_m2),
        ):
            fila = tk.Frame(content, bg=self.C_CARD)
            fila.pack(fill="x")
            fila.grid_columnconfigure(0, weight=1)
            fila.grid_columnconfigure(1, weight=1)

            izq = tk.Frame(fila, bg=self.C_CARD)
            izq.grid(row=0, column=0, sticky="new", padx=(0, 4))
            der = tk.Frame(fila, bg=self.C_CARD)
            der.grid(row=0, column=1, sticky="new", padx=(4, 0))

            self._mk_input(izq, izq_label, izq_var, width=10)
            self._mk_input(der, der_label, der_var, width=10)

        self._sob_vars = {
            "sembrados": (self._sob_sembrados, self._sob_sembrados_ha, self._sob_sembrados_m2),
            "actuales": (self._sob_actuales, self._sob_actuales_ha, self._sob_actuales_m2),
        }
        self._sob_fuente = {"sembrados": None, "actuales": None}

        for columna, (v_total, v_ha, v_m2) in self._sob_vars.items():
            v_total.trace_add("write", lambda *_, c=columna: self._campo_sob_cambiado(c, "total"))
            v_ha.trace_add("write", lambda *_, c=columna: self._campo_sob_cambiado(c, "ha"))
            v_m2.trace_add("write", lambda *_, c=columna: self._campo_sob_cambiado(c, "m2"))

        self._sob_ha.trace_add("write", lambda *_: self._ha_sob_cambiada())

        # ── Resultado ─────────────────────────────────────────────────────────
        res = tk.Frame(content, bg=self.C_RESULT_BG)
        res.pack(fill="x", pady=(10, 0))

        tk.Label(res, text="SOBREVIVENCIA (%)", bg=self.C_RESULT_BG, fg=self.C_SUB,
                 font=("Century Gothic", 7, "bold")).pack(pady=(10, 0))
        self._lbl_sob_valor = tk.Label(res, text="—", bg=self.C_RESULT_BG, fg=self.C_RESULT_ACCENT,
                                       font=("Century Gothic", 18, "bold"))
        self._lbl_sob_valor.pack(pady=(2, 10))

        self._lbl_sob_msg = tk.Label(content, text="",
                                     bg=self.C_CARD, fg=self.C_ERR,
                                     font=("Century Gothic", 7), anchor="w")
        self._lbl_sob_msg.pack(fill="x", pady=(6, 0))

    def _calcular_sobrevivencia(self):
        pares = (
            (self._sob_sembrados, self._sob_actuales),
            (self._sob_sembrados_ha, self._sob_actuales_ha),
            (self._sob_sembrados_m2, self._sob_actuales_m2),
        )

        sembrados = actuales = None
        for var_sembrados, var_actuales in pares:
            s = self._leer(var_sembrados)
            a = self._leer(var_actuales)
            if s is not None and a is not None:
                sembrados, actuales = s, a
                break

        if sembrados is None or actuales is None:
            self._lbl_sob_valor.configure(text="—", fg=self.C_SUB)
            self._lbl_sob_msg.configure(text="")
        elif sembrados <= 0:
            self._lbl_sob_valor.configure(text="⚠", fg=self.C_ERR)
            self._lbl_sob_msg.configure(text="⚠  Los animales sembrados deben ser mayor a 0")
        else:
            sobrevivencia = (actuales / sembrados) * 100
            self._lbl_sob_valor.configure(text=f"{sobrevivencia:,.0f}%", fg=self.C_RESULT_ACCENT)
            self._lbl_sob_msg.configure(text="")

    def _campo_sob_cambiado(self, columna, campo):
        """Se dispara cuando el usuario edita un campo. Recuerda cuál fue la
        fuente (total/ha/m²) de esa columna y no la vuelve a recalcular."""
        if getattr(self, "_auto_llenando", False):
            self._calcular_sobrevivencia()
            return

        self._sob_fuente[columna] = campo
        self._propagar_sob(columna)
        self._calcular_sobrevivencia()

    def _ha_sob_cambiada(self):
        if getattr(self, "_auto_llenando", False):
            return
        self._propagar_sob("sembrados")
        self._propagar_sob("actuales")
        self._calcular_sobrevivencia()

    def _propagar_sob(self, columna):
        var_total, var_ha, var_m2 = self._sob_vars[columna]
        fuente = self._sob_fuente.get(columna)

        ha = self._leer(self._sob_ha)
        if ha is None or ha <= 0:
            # Sin Ha no hay conversión posible: limpia los campos derivados,
            # dejando intacto solo el que el usuario está llenando.
            self._auto_llenando = True
            for key, var in (("total", var_total), ("ha", var_ha), ("m2", var_m2)):
                if key != fuente:
                    var.set("")
            self._auto_llenando = False
            return

        if fuente is None:
            return

        var_fuente = {"total": var_total, "ha": var_ha, "m2": var_m2}[fuente]
        valor = self._leer(var_fuente)
        if valor is None:
            return

        if fuente == "total":
            por_ha = valor / ha
            por_m2 = valor / (ha * 10000)
            objetivo = [(var_ha, por_ha), (var_m2, por_m2)]
        elif fuente == "ha":
            total = valor * ha
            por_m2 = valor / 10000
            objetivo = [(var_total, total), (var_m2, por_m2)]
        else:  # m2
            por_ha = valor * 10000
            total = por_ha * ha
            objetivo = [(var_total, total), (var_ha, por_ha)]

        self._auto_llenando = True
        for var, val in objetivo:
            var.set(f"{val:,.2f}" if val != int(val) else f"{int(val):,}")
        self._auto_llenando = False

    # ── Helpers de construcción ───────────────────────────────────────────────
    def _shadow(self, card):
        tk.Frame(card, bg=self.C_BORDER, height=1).pack(fill="x", side="bottom")
        card.configure(highlightbackground=self.C_BORDER, highlightthickness=1)

    def _mk_field_titulo(self, parent, texto):
        tk.Label(parent, text=texto, bg=self.C_CARD, fg=self.C_BLUE,
                 font=("Century Gothic", 7, "bold")).pack(anchor="w", pady=(0, 2))

    def _mk_input(self, parent, label, var, width=26):
        tk.Label(parent, text=label, bg=self.C_CARD, fg=self.C_TEXT,
                 font=("Century Gothic", 7, "bold")).pack(anchor="w")

        box = tk.Frame(parent, bg=self.C_INPUT,
                       highlightbackground=self.C_BORDER, highlightcolor=self.C_INPUT_FOCUS,
                       highlightthickness=1)
        box.pack(fill="x", pady=(0, 4))

        entry = tk.Entry(box, textvariable=var, font=("Century Gothic", 7),
                         bg=self.C_INPUT, fg=self.C_TEXT, relief="flat",
                         insertbackground=self.C_ACCENT, width=width)
        entry.pack(fill="x", ipady=3, padx=6)

        entry.bind("<FocusIn>", lambda e: box.configure(highlightbackground=self.C_INPUT_FOCUS,
                                                         highlightthickness=1))
        entry.bind("<FocusOut>", lambda e: box.configure(highlightbackground=self.C_BORDER))

        var.trace_add("write", lambda *_: self._formatear_vivo(var, entry))

    # ── Cálculos ──────────────────────────────────────────────────────────────
    def _leer(self, var):
        txt = var.get().strip().replace(",", "")
        if not txt:
            return None
        try:
            return float(txt)
        except ValueError:
            return None

    def _formatear_vivo(self, var, entry):
        """Inserta separador de miles/millones (,) mientras se escribe."""
        if getattr(self, "_formateando", False):
            return

        txt = var.get()
        raw = txt.replace(",", "")
        if raw in ("", "-", "."):
            return

        parts = raw.split(".")
        if len(parts) > 2:
            return

        entero = parts[0]
        neg = entero.startswith("-")
        entero_digitos = entero.lstrip("-")
        if entero_digitos and not entero_digitos.isdigit():
            return

        entero_fmt = f"{int(entero_digitos or 0):,}"
        if neg:
            entero_fmt = "-" + entero_fmt

        nuevo = entero_fmt
        if len(parts) == 2:
            nuevo += "." + parts[1]

        if nuevo == txt:
            return

        cursor = entry.index(tk.INSERT)
        digitos_antes = sum(ch.isdigit() for ch in txt[:cursor])

        pos = len(nuevo)
        contados = 0
        for i, ch in enumerate(nuevo):
            if contados >= digitos_antes:
                pos = i
                break
            if ch.isdigit():
                contados += 1

        self._formateando = True
        var.set(nuevo)

        def _fijar_cursor():
            entry.icursor(pos)
            self._formateando = False

        entry.after_idle(_fijar_cursor)

    def _prorratear(self, alim_total, anim_piscina, anim_total):
        """Alimento de la piscina = alimento total x (animales piscina / animales totales)."""
        if alim_total is None:
            return None
        if anim_piscina is None or anim_total is None:
            return alim_total
        if anim_total <= 0:
            return None
        return alim_total * (anim_piscina / anim_total)

    def _calcular(self):
        alim_precria_total = self._leer(self._alim_precria)
        anim_precria_piscina = self._leer(self._anim_precria_piscina)
        anim_precria_total = self._leer(self._anim_precria_total)

        alim_preengorde_total = self._leer(self._alim_preengorde)
        anim_preengorde_piscina = self._leer(self._anim_preengorde_piscina)
        anim_preengorde_total = self._leer(self._anim_preengorde_total)

        acumulado_kg = self._leer(self._alim_acumulado)
        bio_inicial = self._leer(self._bio_inicial)
        bio_actual = self._leer(self._bio_actual)

        precria_kg = self._prorratear(alim_precria_total, anim_precria_piscina, anim_precria_total)
        preengorde_kg = self._prorratear(alim_preengorde_total, anim_preengorde_piscina, anim_preengorde_total)

        # Alimento en kg -> convertido a libras para calcular con la biomasa (lb)
        precria_lb = precria_kg * KG_A_LB if precria_kg is not None else None
        preengorde_lb = preengorde_kg * KG_A_LB if preengorde_kg is not None else None
        acumulado_lb = acumulado_kg * KG_A_LB if acumulado_kg is not None else None

        hay_error = False

        # FCA Bruto = alimento acumulado / biomasa actual
        if acumulado_lb is not None and bio_actual is not None:
            if bio_actual > 0:
                self._resultados["bruto"].configure(
                    text=f"{acumulado_lb / bio_actual:,.2f}", fg=self.C_RESULT_ACCENT)
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
                    text=f"{acumulado_lb / ganancia:,.2f}", fg=self.C_RESULT_ACCENT)
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
                    text=f"{total / bio_actual:,.2f}", fg=self.C_RESULT_ACCENT)
            else:
                self._resultados["larva"].configure(text="⚠", fg=self.C_ERR)
                hay_error = True
        else:
            self._resultados["larva"].configure(text="—", fg=self.C_SUB)

        if hay_error:
            self._lbl_msg.configure(text="⚠  Revisa los valores ingresados", fg=self.C_ERR)
        else:
            self._lbl_msg.configure(text="")

    def _centrar(self):
        self.update_idletasks()
        w = self.winfo_width()
        h = self.winfo_height()
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")


if __name__ == "__main__":
    App().mainloop()
