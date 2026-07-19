"""
App GUI - Control de Bodegas Laboratorios Naturisa
"""

import tkinter as tk
from tkinter import ttk, filedialog
import threading
import sys
import os

import reporte_inventario
import reporte_diario


class _LogRedirect:
    def __init__(self, widget: tk.Text):
        self._widget = widget

    def write(self, msg: str):
        if msg:
            self._widget.configure(state="normal")
            self._widget.insert(tk.END, msg)
            self._widget.see(tk.END)
            self._widget.configure(state="disabled")
            self._widget.update_idletasks()

    def flush(self):
        pass


class App(tk.Tk):
    # ── Paleta Naturisa AP1 ──────────────────────────────────────────────────
    C_BG      = "#EEF2F7"
    C_CARD    = "#FFFFFF"
    C_PANEL   = "#1F3864"
    C_STRIPE  = "#EBF3FB"
    C_ACCENT  = "#1F3864"
    C_BLUE    = "#2E75B6"
    C_TEXT    = "#1A2535"
    C_SUB     = "#5A7A9A"
    C_BORDER  = "#C8D8E8"
    C_INPUT   = "#EBF3FB"
    C_LOG_FG  = "#1F3864"
    C_OK      = "#1A6B1A"
    C_ERR     = "#C0392B"
    C_MUTED   = "#8AAABB"

    def __init__(self):
        super().__init__()
        self.title("JP Alertas")
        self.resizable(False, False)
        self.configure(bg=self.C_BG)
        try:
            import os
            ico = os.path.join(os.path.dirname(__file__), "AP1.ico")
            self.iconbitmap(ico)
        except Exception:
            pass
        self._ruta = tk.StringVar()
        self._build()
        self._centrar()

    def _build(self):
        wrap = tk.Frame(self, bg=self.C_BG)
        wrap.pack(padx=16, pady=16)

        # ── Header bar ───────────────────────────────────────────────────────
        hdr = tk.Frame(wrap, bg=self.C_CARD,
                       highlightbackground=self.C_BORDER, highlightthickness=1)
        hdr.pack(fill="x", pady=(0, 8))

        hdr_inner = tk.Frame(hdr, bg=self.C_CARD)
        hdr_inner.pack(fill="x", padx=16, pady=10)

        # Logo / branding
        brand = tk.Frame(hdr_inner, bg=self.C_CARD)
        brand.pack(side="left")

        tk.Label(brand, text="JP", bg=self.C_CARD, fg=self.C_ACCENT,
                 font=("Segoe UI", 16, "bold")).pack(side="left")
        tk.Label(brand, text=" ALERTAS", bg=self.C_CARD, fg=self.C_ACCENT,
                 font=("Segoe UI", 16, "bold")).pack(side="left")

        tk.Label(hdr_inner, text="//  CONTROL DE BODEGAS",
                 bg=self.C_CARD, fg=self.C_SUB,
                 font=("Segoe UI", 7)).pack(side="right", pady=(4, 0))

        # ── Cuerpo principal ─────────────────────────────────────────────────
        body = tk.Frame(wrap, bg=self.C_CARD,
                        highlightbackground=self.C_BORDER, highlightthickness=1)
        body.pack(fill="x")

        # ── Tabs ─────────────────────────────────────────────────────────────
        tab_bar = tk.Frame(body, bg=self.C_PANEL)
        tab_bar.pack(fill="x")

        # Línea superior accent
        tk.Frame(tab_bar, bg=self.C_ACCENT, height=2).pack(fill="x")

        tab_inner = tk.Frame(tab_bar, bg=self.C_PANEL)
        tab_inner.pack(fill="x", padx=0)

        self._tab_lab_btn = tk.Button(
            tab_inner, text="  LABORATORIOS  ",
            command=lambda: self._switch("lab"),
            font=("Segoe UI", 8, "bold"), relief="flat",
            cursor="hand2", bd=0, pady=9, padx=8
        )
        self._tab_lab_btn.pack(side="left")

        self._tab_alerta_btn = tk.Button(
            tab_inner, text="  ALERTA TOLVA  ",
            command=lambda: self._switch("alerta"),
            font=("Segoe UI", 8, "bold"), relief="flat",
            cursor="hand2", bd=0, pady=9, padx=8
        )
        self._tab_alerta_btn.pack(side="left")

        self._lbl_mode = tk.Label(tab_inner, text="",
                                  bg=self.C_PANEL, fg="#A8C8E8",
                                  font=("Segoe UI", 7))
        self._lbl_mode.pack(side="right", padx=14)

        # ── Contenedor paneles ────────────────────────────────────────────────
        self._content = tk.Frame(body, bg=self.C_CARD)
        self._content.pack(fill="x", padx=20, pady=16)

        # Panel Laboratorios
        self._panel_lab = tk.Frame(self._content, bg=self.C_CARD)

        self._mk_field_label(self._panel_lab, "ARCHIVO SAP",
                             "Selecciona el archivo EXPORT_*.xlsx de SAP")

        file_box = tk.Frame(self._panel_lab, bg=self.C_INPUT,
                            highlightbackground=self.C_BORDER,
                            highlightthickness=1)
        file_box.pack(fill="x", pady=(0, 14))

        tk.Label(file_box, text=" >_", bg=self.C_INPUT, fg=self.C_ACCENT,
                 font=("Segoe UI", 9), padx=6).pack(side="left")

        self._entry = tk.Entry(file_box, textvariable=self._ruta,
                               font=("Segoe UI", 8), state="readonly",
                               readonlybackground=self.C_INPUT,
                               fg=self.C_TEXT, relief="flat",
                               insertbackground=self.C_ACCENT, width=26)
        self._entry.pack(side="left", fill="x", expand=True, ipady=7)

        tk.Button(file_box, text="EXAMINAR",
                  command=self._seleccionar,
                  bg=self.C_BLUE, fg="#FFFFFF",
                  font=("Segoe UI", 7, "bold"),
                  relief="flat", cursor="hand2",
                  activebackground=self.C_ACCENT,
                  activeforeground="#FFFFFF",
                  padx=10, pady=7, bd=0).pack(side="right")

        self._btn = tk.Button(self._panel_lab,
                              text="▶   GENERAR Y ENVIAR REPORTE",
                              command=self._ejecutar,
                              bg=self.C_BLUE, fg="#FFFFFF",
                              font=("Segoe UI", 9, "bold"),
                              relief="flat", cursor="hand2",
                              activebackground=self.C_ACCENT,
                              activeforeground=self.C_CARD,
                              pady=11, bd=0)
        self._btn.pack(fill="x")

        # Panel Alerta Tolva
        self._panel_alerta = tk.Frame(self._content, bg=self.C_CARD)

        self._mk_field_label(self._panel_alerta, "ALERTA PISCINAS",
                             "Detecta piscinas con Saldo Tolva > 0 sin Cargado ni Sobrante")

        self._btn_alerta = tk.Button(self._panel_alerta,
                                     text="▶   EJECUTAR ALERTA PISCINAS",
                                     command=self._ejecutar_alerta,
                                     bg=self.C_ACCENT, fg=self.C_CARD,
                                     font=("Segoe UI", 9, "bold"),
                                     relief="flat", cursor="hand2",
                                     activebackground=self.C_BLUE,
                                     activeforeground="#FFFFFF",
                                     pady=11, bd=0)
        self._btn_alerta.pack(fill="x")

        # ── Status ────────────────────────────────────────────────────────────
        self._status = tk.Label(body, text="  SISTEMA LISTO",
                                bg=self.C_PANEL, fg="#A8C8E8",
                                font=("Segoe UI", 7), anchor="w", pady=5)
        self._status.pack(fill="x", padx=20)

        # ── Log panel ─────────────────────────────────────────────────────────
        log_wrap = tk.Frame(wrap, bg=self.C_BG)
        log_wrap.pack(fill="x", pady=(8, 0))

        log_hdr = tk.Frame(log_wrap, bg=self.C_PANEL,
                           highlightbackground=self.C_BORDER, highlightthickness=1)
        log_hdr.pack(fill="x")

        tk.Label(log_hdr, text="  // PROGRESO",
                 bg=self.C_PANEL, fg="#FFFFFF",
                 font=("Segoe UI", 7, "bold"), pady=5).pack(side="left")

        log_body = tk.Frame(log_wrap, bg=self.C_INPUT,
                            highlightbackground=self.C_BORDER, highlightthickness=1)
        log_body.pack(fill="x")

        self._log = tk.Text(log_body, width=62, height=7,
                            bg=self.C_INPUT, fg=self.C_LOG_FG,
                            font=("Segoe UI", 8),
                            state="disabled", relief="flat",
                            padx=12, pady=8, wrap="word",
                            selectbackground=self.C_MUTED,
                            insertbackground=self.C_LOG_FG)
        sb = ttk.Scrollbar(log_body, command=self._log.yview)
        self._log.configure(yscrollcommand=sb.set)
        self._log.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        self._switch("lab")

    # ── Helpers de construcción ───────────────────────────────────────────────
    def _mk_field_label(self, parent, title, subtitle):
        tk.Label(parent, text=title,
                 bg=self.C_CARD, fg=self.C_ACCENT,
                 font=("Segoe UI", 8, "bold")).pack(anchor="w")
        tk.Label(parent, text=subtitle,
                 bg=self.C_CARD, fg=self.C_SUB,
                 font=("Segoe UI", 7)).pack(anchor="w", pady=(2, 8))

    # ── Tabs ──────────────────────────────────────────────────────────────────
    def _switch(self, tab):
        if tab == "lab":
            self._panel_alerta.pack_forget()
            self._panel_lab.pack(fill="x")
            self._tab_lab_btn.configure(bg=self.C_CARD, fg=self.C_ACCENT,
                                        activebackground=self.C_CARD,
                                        activeforeground=self.C_ACCENT)
            self._tab_alerta_btn.configure(bg=self.C_PANEL, fg="#A8C8E8",
                                           activebackground=self.C_PANEL,
                                           activeforeground="#FFFFFF")
            self._lbl_mode.configure(text="MODE: INVENTARIO")
        else:
            self._panel_lab.pack_forget()
            self._panel_alerta.pack(fill="x")
            self._tab_alerta_btn.configure(bg=self.C_CARD, fg=self.C_ACCENT,
                                           activebackground=self.C_CARD,
                                           activeforeground=self.C_ACCENT)
            self._tab_lab_btn.configure(bg=self.C_PANEL, fg="#A8C8E8",
                                        activebackground=self.C_PANEL,
                                        activeforeground="#FFFFFF")
            self._lbl_mode.configure(text="MODE: ALERTA TOLVA")
        self._set_status("SISTEMA LISTO")

    # ── Acciones ──────────────────────────────────────────────────────────────
    def _bloquear(self):
        self._btn.configure(state="disabled")
        self._btn_alerta.configure(state="disabled")

    def _desbloquear(self):
        self._btn.configure(state="normal", text="▶   GENERAR Y ENVIAR REPORTE")
        self._btn_alerta.configure(state="normal", text="▶   EJECUTAR ALERTA PISCINAS")

    def _seleccionar(self):
        ruta = filedialog.askopenfilename(
            title="Seleccionar archivo SAP",
            filetypes=[("Excel", "*.xlsx *.xls"), ("Todos", "*.*")],
            initialdir=os.path.join(os.path.expanduser("~"), "Desktop"),
        )
        if ruta:
            self._ruta.set(ruta)
            self._log_clear()
            self._log_write(f"> archivo: {os.path.basename(ruta)}\n")
            self._set_status("ARCHIVO CARGADO — LISTO", self.C_ACCENT)

    def _ejecutar(self):
        ruta = self._ruta.get().strip()
        if not ruta:
            self._set_status("⚠  SELECCIONA EL ARCHIVO SAP PRIMERO", self.C_ERR)
            return
        self._bloquear()
        self._btn.configure(text="PROCESANDO...")
        self._log_clear()
        self._set_status("PROCESANDO...", self.C_ACCENT)

        old_stdout = sys.stdout
        sys.stdout = _LogRedirect(self._log)

        def _worker():
            try:
                reporte_inventario.main(ruta_excel=ruta)
                self.after(0, self._on_ok)
            except Exception as exc:
                self.after(0, lambda: self._on_err(exc))
            finally:
                sys.stdout = old_stdout

        threading.Thread(target=_worker, daemon=True).start()

    def _ejecutar_alerta(self):
        self._bloquear()
        self._btn_alerta.configure(text="CONSULTANDO API...")
        self._log_clear()
        self._set_status("CONSULTANDO API...", self.C_ACCENT)

        old_stdout = sys.stdout
        sys.stdout = _LogRedirect(self._log)

        def _worker():
            try:
                reporte_diario.main()
                self.after(0, self._on_ok_alerta)
            except Exception as exc:
                self.after(0, lambda: self._on_err(exc))
            finally:
                sys.stdout = old_stdout

        threading.Thread(target=_worker, daemon=True).start()

    def _on_ok(self):
        self._desbloquear()
        self._set_status("✓  REPORTE ENVIADO CORRECTAMENTE", self.C_OK)

    def _on_ok_alerta(self):
        self._desbloquear()
        self._set_status("✓  ALERTA EJECUTADA — CORREO ENVIADO", self.C_OK)

    def _on_err(self, exc):
        self._desbloquear()
        self._log_write(f"\n> ERROR: {exc}\n")
        self._set_status(f"✗  ERROR: {exc}", self.C_ERR)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _log_write(self, msg):
        self._log.configure(state="normal")
        self._log.insert(tk.END, msg)
        self._log.see(tk.END)
        self._log.configure(state="disabled")

    def _log_clear(self):
        self._log.configure(state="normal")
        self._log.delete("1.0", tk.END)
        self._log.configure(state="disabled")

    def _set_status(self, msg, color=None):
        self._status.configure(text=f"  {msg}",
                               fg=color if color else "#A8C8E8")

    def _centrar(self):
        self.update_idletasks()
        w = self.winfo_width()
        h = self.winfo_height()
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        self.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")


if __name__ == "__main__":
    App().mainloop()
