export const CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }

.uiv-box {
  position: fixed; pointer-events: none; z-index: 2147483646;
  border: 1px solid #6366f1; border-radius: 2px;
  background: rgba(99,102,241,0.12); display: none;
}
.uiv-box.sel { border: 1.5px solid #22d3ee; background: rgba(34,211,238,0.10); }
.uiv-tag {
  position: fixed; pointer-events: none; z-index: 2147483647;
  background: #6366f1; color: #fff; font-size: 11px; line-height: 1;
  padding: 3px 6px; border-radius: 3px; white-space: nowrap; display: none;
}

/* ---- responsive (virtual screen) ---- */
.uiv-framewrap {
  position: fixed; inset: 0; z-index: 2147483640; display: none;
  background: #0a0a0bf2; flex-direction: column;
}
.uiv-framewrap.show { display: flex; }
.uiv-framebar {
  display: flex; align-items: center; gap: 12px;
  height: 46px; padding: 0 14px; color: #e4e4e7; font-size: 12px; flex: 0 0 auto;
  border-bottom: 1px solid #27272a;
}
.uiv-framechips { display: flex; gap: 6px; flex: 1; justify-content: center; flex-wrap: wrap; }
.uiv-framew { font-family: ui-monospace, monospace; color: #c7d2fe; font-weight: 600;
  white-space: nowrap; flex: 0 0 auto; }
.uiv-framex { cursor: pointer; color: #a1a1aa; font-size: 14px; flex: 0 0 auto; }
.uiv-framex:hover { color: #fff; }
.uiv-framestage {
  flex: 1; display: flex; align-items: stretch; justify-content: center;
  padding: 16px; overflow: auto;
}
.uiv-framehost { position: relative; width: 768px; flex: 0 0 auto; }
.uiv-frame {
  width: 100%; height: 100%; border: 0; background: #fff;
  border-radius: 8px; box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}
.uiv-framehandle {
  position: absolute; top: 0; right: -7px; width: 14px; height: 100%;
  cursor: ew-resize; display: flex; align-items: center; justify-content: center;
}
.uiv-framehandle::after {
  content: ''; width: 4px; height: 44px; border-radius: 4px; background: #52525b;
}
.uiv-framehandle:hover::after { background: #818cf8; }

.uiv-fab {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 44px; height: 44px; border-radius: 50%; cursor: pointer;
  background: #18181b; color: #a5b4fc; border: 1px solid #3f3f46;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; box-shadow: 0 6px 24px rgba(0,0,0,0.35); user-select: none;
}
.uiv-fab.on { background: #4f46e5; color: #fff; border-color: #6366f1; }

.uiv-panel {
  position: fixed; right: 16px; bottom: 72px; z-index: 2147483647;
  width: 360px; max-height: 84vh; overflow: auto;
  background: #141416; color: #e4e4e7; border: 1px solid #2a2a2e;
  border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  font-size: 12px; display: none;
}
.uiv-panel.show { display: block; }

.uiv-head {
  display: flex; align-items: center; gap: 8px; padding: 11px 13px;
  border-bottom: 1px solid #242428; position: sticky; top: 0; z-index: 5; background: #141416;
}
.uiv-head b { font-size: 13px; color: #fafafa; letter-spacing: .2px; }
.uiv-lang { margin-left: auto; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: .4px;
  padding: 2px 7px; border-radius: 6px; background: #1c1c20; border: 1px solid #313138; color: #a1a1aa; }
.uiv-lang:hover { color: #fff; border-color: #4f46e5; background: #26262c; }
.uiv-bp { font-size: 10px; padding: 2px 8px; border-radius: 999px;
  background: #312e81; color: #c7d2fe; font-weight: 600; }
.uiv-x { cursor: pointer; color: #71717a; padding: 2px 4px; }
.uiv-x:hover { color: #fff; }

.uiv-sec { padding: 11px 13px; border-bottom: 1px solid #1f1f22; }

/* ---- Framer-style flex/grid alignment buttons (Justify / Align rows) ---- */
.uiv-fbtns { display: flex; gap: 5px; }
.uiv-fbtn { flex: 1; display: flex; align-items: center; justify-content: center; height: 30px;
  border-radius: 8px; background: #1c1c20; border: 1px solid #313138; color: #8b8b94;
  cursor: pointer; transition: background .12s ease, color .12s ease, border-color .12s ease; }
.uiv-fbtn:hover { background: #26262c; color: #e4e4e7; border-color: #45454d; }
.uiv-fbtn.on { background: #312e81; border-color: #6366f1; color: #fff; box-shadow: 0 0 0 1px #4f46e5 inset; }
.uiv-empty { color: #71717a; padding: 18px 12px; text-align: center; }

.uiv-meta { line-height: 1.5; }
.uiv-meta .uiv-el { color: #67e8f9; font-weight: 600; }
.uiv-meta .uiv-src { color: #a1a1aa; word-break: break-all; }
.uiv-meta .uiv-mech { display: inline-block; margin-top: 4px; font-size: 10px;
  padding: 1px 6px; border-radius: 4px; background: #27272a; color: #d4d4d8; }

/* ---- breakpoint scope + class target chips ---- */
.uiv-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.uiv-chip, .uiv-clschip {
  cursor: pointer; border: 1px solid #3f3f46; background: #27272a; color: #a1a1aa;
  border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600;
  font-family: ui-monospace, monospace;
}
.uiv-chip { display: inline-flex; align-items: center; gap: 4px; }
.uiv-chip svg { width: 13px; height: 13px; opacity: .85; }
.uiv-chip:hover, .uiv-clschip:hover { color: #fff; background: #3f3f46; }
.uiv-chip.on svg { opacity: 1; }
.uiv-chip.win { border-color: #52525b; color: #d4d4d8; }
.uiv-chip.on, .uiv-clschip.on { background: #4f46e5; border-color: #6366f1; color: #fff; }
.uiv-bphint { margin-top: 7px; font-size: 10px; color: #71717a; line-height: 1.4; }
.uiv-bphint b { color: #c7d2fe; }
/* "Apply changes to" dropdown (sits outside .uiv-ctl, so style it directly) */
.uiv-targetsel { width: 100%; box-sizing: border-box; cursor: pointer;
  background: #1c1c20; border: 1px solid #313138; color: #fff;
  border-radius: 7px; padding: 7px 9px; font-size: 12px; outline: none; }
.uiv-targetsel:hover { border-color: #45454d; }
.uiv-targetsel:focus { border-color: #6366f1; }
.uiv-newclass {
  margin-top: 7px; box-sizing: border-box; width: 100%;
  border: 1px dashed #52525b; background: transparent; color: #e4e4e7;
  border-radius: 7px; padding: 6px 9px; font-size: 12px; outline: none;
  font-family: ui-monospace, monospace;
}
.uiv-newclass::placeholder { color: #71717a; }
.uiv-newclass:focus { border-style: solid; border-color: #6366f1; color: #fff; }

/* ---- design-system indicator + token pickers ---- */
.uiv-dsbar { padding: 7px 12px; border-bottom: 1px solid #27272a;
  font-size: 10px; font-weight: 600; letter-spacing: .3px; color: #a5b4fc;
  background: #1e1b4b33; display: flex; align-items: center; gap: 6px; }
.uiv-tlabel { color: #818cf8 !important; font-size: 10px; }
.uiv-ctl select.uiv-tokensel {
  width: 100%; background: #1e1b4b55; border: 1px solid #4338ca; color: #c7d2fe;
  border-radius: 7px; padding: 6px 7px; font-size: 11px; outline: none;
  font-family: ui-monospace, monospace; }
.uiv-ctl select.uiv-tokensel:hover { border-color: #6366f1; color: #fff; }
.uiv-ctl select.uiv-tokensel:focus { border-color: #818cf8; }
.uiv-ctl select.uiv-tokensel.changed { border-color: #4ade80; color: #86efac; }
.uiv-swatches { display: flex; flex-wrap: wrap; gap: 5px; }
.uiv-swatch { width: 20px; height: 20px; border-radius: 5px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.18); padding: 0; outline: none;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15); }
.uiv-swatch:hover { transform: scale(1.12); border-color: #fff; }
.uiv-swatch.on { box-shadow: 0 0 0 2px #18181b, 0 0 0 3.5px #4ade80; border-color: #4ade80; }

/* ---- current-styles readout ---- */
.uiv-readout { display: flex; flex-direction: column; gap: 3px; }
.uiv-rrow { display: grid; grid-template-columns: 70px 1fr; gap: 8px; align-items: center;
  font-size: 11px; font-family: ui-monospace, monospace; }
.uiv-rk { color: #71717a; }
.uiv-rv { color: #fff; word-break: break-all; display: flex; align-items: center; gap: 6px; }
.uiv-rv.changed { color: #4ade80; } /* edited in uivisor → green */

/* control-row state: file (authored) · edited (this breakpoint) · auto (computed) */
/* 3-state colour on BOTH the label and the value (input / select text) */
.uiv-ctl.st-file > .clabel,
.uiv-ctl.st-file .uiv-num input, .uiv-ctl.st-file select.uiv-sel { color: #e4e4e7; }
.uiv-ctl.st-edited > .clabel,
.uiv-ctl.st-edited .uiv-num input, .uiv-ctl.st-edited select.uiv-sel { color: #4ade80; }
.uiv-ctl.st-inherit > .clabel,
.uiv-ctl.st-inherit .uiv-num input, .uiv-ctl.st-inherit select.uiv-sel { color: #38bdf8; } /* cascaded */
.uiv-ctl.st-auto > .clabel,
.uiv-ctl.st-auto .uiv-num input, .uiv-ctl.st-auto select.uiv-sel { color: #6b7280; }

/* "+" chips for hidden auto controls (width/height when not set) */
.uiv-adds { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.uiv-addctl { cursor: pointer; border: 1px dashed #52525b; background: transparent;
  color: #71717a; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 600;
  font-family: ui-monospace, monospace; }
.uiv-addctl:hover { color: #fff; border-color: #6366f1; }
.uiv-inh { font-size: 9px; font-weight: 700; color: #38bdf8; font-family: ui-monospace, monospace;
  background: #0c4a6e55; border: 1px solid #0369a1; border-radius: 4px; padding: 0 3px; margin-left: 2px; }
.uiv-leg { display: flex; gap: 12px; padding: 8px 12px 2px; font-size: 9px;
  text-transform: uppercase; letter-spacing: .4px; }
.uiv-lg { color: #e4e4e7; display: flex; align-items: center; gap: 4px; } /* file = white */
.uiv-lg::before { content: ''; width: 7px; height: 7px; border-radius: 2px; background: currentColor; }
.uiv-lg.edit { color: #4ade80; }
.uiv-lg.inh { color: #38bdf8; }
.uiv-lg.auto { color: #6b7280; }
.uiv-sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.2); flex: 0 0 auto; }

/* ---- Figma-like sectioned controls ---- */
.uiv-sectitle { margin: 0 0 8px; font-size: 10px; text-transform: uppercase;
  letter-spacing: .5px; color: #8b8b94; font-weight: 600; }
.uiv-sec + .uiv-sec .uiv-sectitle { margin-top: 0; }

/* collapsible (accordion) section header */
.uiv-acc { display: flex; align-items: center; gap: 5px; width: 100%;
  background: none; border: 0; padding: 0; cursor: pointer; text-align: left;
  font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
  color: #8b8b94; font-weight: 600; }
.uiv-acc:hover { color: #c7d2fe; }
.uiv-acc.collapsed { margin-bottom: 0; }
.uiv-chev { display: inline-flex; color: #6b6b73; transition: transform .15s ease; }
.uiv-acc:hover .uiv-chev { color: #818cf8; }
.uiv-acc:not(.collapsed) .uiv-chev { transform: rotate(90deg); }

.uiv-ctl { display: grid; grid-template-columns: 84px 1fr 26px; gap: 8px;
  align-items: center; margin-bottom: 7px; }
.uiv-ctl > .clabel { overflow: hidden; text-overflow: ellipsis; }
.uiv-ctl:last-child { margin-bottom: 0; }
.uiv-ctl > .clabel { font-size: 11px; color: #a1a1aa; }
.uiv-ctl > .cfield { min-width: 0; }

/* numeric field with a scrub handle on the left */
.uiv-num { display: flex; align-items: stretch; background: #1c1c20;
  border: 1px solid #313138; border-radius: 7px; overflow: hidden; }
.uiv-num.changed { border-color: #4ade80; }
.uiv-num.changed input { color: #4ade80; } /* uivisor-edited value → green */
.uiv-sel.changed, .uiv-color.changed { border-color: #4ade80; }
.uiv-num:focus-within { border-color: #6366f1; }
.uiv-scrub { display: flex; align-items: center; justify-content: center;
  width: 24px; color: #8b8b94; cursor: ew-resize; user-select: none;
  flex: 0 0 auto; touch-action: none; }
.uiv-scrub:hover { color: #c7d2fe; background: #323238; }
.uiv-scrub.txt { font-size: 10px; font-weight: 600; }
.uiv-num input { flex: 1; min-width: 0; background: transparent; border: none;
  color: #fff; padding: 5px 7px 5px 2px; font-size: 12px; outline: none;
  -moz-appearance: textfield; }
.uiv-num input::-webkit-outer-spin-button,
.uiv-num input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.uiv-num input::placeholder { color: #6b6b73; }

/* unit selector inside a dim field */
.uiv-unit { flex: 0 0 auto; width: auto; max-width: 52px; background: #323238; border: none;
  border-left: 1px solid #3f3f46; color: #a1a1aa; font-size: 11px;
  padding: 0 3px; outline: none; cursor: pointer; }
.uiv-unit:hover { color: #fff; }

.uiv-expand { display: flex; align-items: center; justify-content: center;
  width: 26px; height: 28px; border-radius: 7px; cursor: pointer;
  background: #1c1c20; border: 1px solid #313138; color: #8b8b94; }
.uiv-expand:hover { color: #fff; background: #3f3f46; }
.uiv-expand.on { color: #c7d2fe; border-color: #4f46e5; background: #312e81; }

.uiv-sides { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; margin: -1px 0 8px; }

/* Weight dropdown only — must NOT match the unit <select> inside dim fields. */
.uiv-ctl select.uiv-sel {
  width: 100%; background: #1c1c20; border: 1px solid #313138; color: #fff;
  border-radius: 7px; padding: 6px 7px; font-size: 12px; outline: none;
}
.uiv-ctl select.uiv-sel:focus { border-color: #6366f1; }
.uiv-ctl input[type=color] { width: 100%; height: 28px; padding: 2px; cursor: pointer;
  background: #1c1c20; border: 1px solid #313138; border-radius: 7px; }
.uiv-ctl input.uiv-text { width: 100%; background: #1c1c20; border: 1px solid #313138;
  color: #fff; border-radius: 7px; padding: 6px 7px; font-size: 12px; outline: none; }
.uiv-ctl input.uiv-text:focus { border-color: #6366f1; }
.uiv-ctl input.uiv-text.changed { border-color: #4ade80; color: #4ade80; }

.uiv-journal { display: flex; flex-direction: column; gap: 8px; }
.uiv-jitem { background: #1f1f23; border: 1px solid #27272a; border-radius: 8px; padding: 8px; }
.uiv-jitem .jhead { display: flex; gap: 6px; align-items: baseline; }
.uiv-jitem .jel { color: #67e8f9; font-weight: 600; }
.uiv-jitem .jloc { color: #71717a; font-size: 10px; margin-left: auto; word-break: break-all; }
.uiv-jchg { color: #d4d4d8; margin-top: 3px; font-family: ui-monospace, monospace; font-size: 11px; }
.uiv-jchg .bp { color: #818cf8; }
.uiv-jchg .tok { color: #4ade80; }

.uiv-foot { display: flex; gap: 6px; padding: 10px 12px; position: sticky; bottom: 0; z-index: 8;
  background: #18181b; border-top: 1px solid #27272a; flex-wrap: wrap; }
.uiv-btn { flex: 1; cursor: pointer; border: 1px solid #3f3f46; background: #27272a;
  color: #e4e4e7; border-radius: 7px; padding: 7px 8px; font-size: 11px; font-weight: 600;
  white-space: nowrap; }
.uiv-btn:hover { background: #3f3f46; }
.uiv-btn.primary { background: #4f46e5; border-color: #6366f1; color: #fff; flex-basis: 100%; }
.uiv-btn.primary:hover { background: #4338ca; }
.uiv-btn.ghost { flex: 0 0 auto; }
/* floating read-only "all styles" block — top-LEFT of the screen, its top edge on
   the same line as the breakpoint toolbar (which is centred up top). */
.uiv-info { position: fixed; left: 14px; top: 8px; z-index: 2147483646;
  width: 216px; max-height: 84vh; overflow: auto; display: none;
  background: rgba(24,24,27,0.92); color: #e4e4e7;
  border: 1px solid #3f3f46; border-radius: 10px; padding: 8px 10px;
  font-size: 11px; box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
.uiv-info.show { display: block; }
.uiv-info-h { font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
  color: #8b8b94; font-weight: 600; margin-bottom: 6px; }
.uiv-info-sub { color: #52525b; }
/* ---- box-model widget (nested margin / padding, Figma/Framer style) ----
   Bands are sized so the side inputs NEVER overlap the inner content box:
   vertical band 26px (> input 18px), horizontal band 46px (> input 36px). */
.uiv-bm { position: relative; height: 148px; margin: 2px 0 9px;
  background: #1b1b1f; border: 1px solid #2f2f35; border-radius: 9px; }
.uiv-bm-pad { position: absolute; top: 26px; bottom: 26px; left: 46px; right: 46px;
  background: #26262c; border: 1px solid #3a3a42; border-radius: 7px; }
.uiv-bm-content { position: absolute; z-index: 0; top: 26px; bottom: 26px; left: 46px; right: 46px;
  background: #34343c; border-radius: 5px; }
.uiv-bm-tag { position: absolute; z-index: 1; top: 4px; left: 8px; font-size: 7.5px; font-weight: 700;
  letter-spacing: .5px; color: #6b6b73; pointer-events: none; }
.uiv-bm-i { position: absolute; z-index: 3; width: 36px; height: 18px; padding: 0; box-sizing: border-box;
  background: #0e0e11; border: 1px solid #34343c; border-radius: 5px;
  color: #d4d4d8; text-align: center; text-align-last: center; line-height: 16px; font-size: 10px;
  outline: none; cursor: ew-resize; font-family: ui-monospace, monospace; -moz-appearance: textfield; }
.uiv-bm-i::-webkit-outer-spin-button, .uiv-bm-i::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.uiv-bm-i:hover { border-color: #52525b; }
.uiv-bm-i:focus { cursor: text; border-color: #6366f1; }
.uiv-bm-i.bm-top { top: 4px; left: 50%; transform: translateX(-50%); }
.uiv-bm-i.bm-bottom { bottom: 4px; left: 50%; transform: translateX(-50%); }
.uiv-bm-i.bm-left { left: 5px; top: 50%; transform: translateY(-50%); }
.uiv-bm-i.bm-right { right: 5px; top: 50%; transform: translateY(-50%); }
.uiv-bm-i.st-file { color: #e4e4e7; }
.uiv-bm-i.st-edited { color: #4ade80; }
.uiv-bm-i.st-inherit { color: #38bdf8; }
.uiv-bm-i.st-auto { color: #6b7280; }
/* a side bound to a design token — shown by name, accent-coloured, no spin */
.uiv-bm-i.uiv-bm-tok { color: #a5b4fc; font-size: 9px; letter-spacing: -0.2px;
  border-color: #4338ca; background: #1e1b4b40; text-overflow: ellipsis; }
.uiv-bm-i.uiv-bm-tok.st-edited { color: #818cf8; }
/* spacing-token dropdown — opens when a side value is focused/clicked */
.uiv-bm-pop { display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  margin: -3px 0 8px; padding: 8px; background: #1c1c20; border: 1px solid #34343c;
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.uiv-bm-pop[hidden] { display: none; }
.uiv-bm-poplabel { width: 100%; font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .4px; color: #6b6b73; font-family: ui-monospace, monospace; }
.uiv-bm-chip { background: #1e1b4b55; border: 1px solid #4338ca; color: #c7d2fe; border-radius: 6px;
  padding: 3px 8px; font-size: 10px; cursor: pointer; font-family: ui-monospace, monospace; }
.uiv-bm-chip:hover { background: #4f46e5; border-color: #6366f1; color: #fff; }

.uiv-toast { position: fixed; right: 16px; bottom: 128px; z-index: 2147483647;
  background: #22c55e; color: #052e16; padding: 8px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 600; display: none; }
.uiv-toast.show { display: block; }
.uiv-hint { font-size: 10px; color: #71717a; padding: 0 12px 10px; }
`
