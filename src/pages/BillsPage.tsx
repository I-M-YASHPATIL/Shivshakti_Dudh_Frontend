import { useState } from 'react';
import { billAPI, milkEntryAPI, ledgerAPI } from '../services/api';
import { useBranch } from '../pages/Branchcontext';
import type { BillResponse, MilkEntryResponse, LedgerResponse } from '../types/dairyTypes';
import { generateBillsPDF, generatePaymentRegisterPDF } from '../pages/Billpdfgenerator';
import toast from 'react-hot-toast';
import { FileText, Printer, ChevronDown, ChevronUp, Calendar, Download } from 'lucide-react';
import { format, eachDayOfInterval, parseISO, getDaysInMonth, getMonth, getYear } from 'date-fns';

const n = (v: number | undefined | null, decimals = 2): string => ((v ?? 0)).toFixed(decimals);

// ─── Shared bill maths (must match Billpdfgenerator.ts) ──────────────────────

/** Fixed सादिलवार charge applied to every (split) bill. */
const SADILVAR_AMOUNT = 6;

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

function isMixedBill(bill: BillResponse): boolean {
  return (bill.cowTotalLiters ?? 0) > 0 && (bill.buffaloTotalLiters ?? 0) > 0;
}

/** सादिलवार — always ₹6 per bill card. */
function sadilvarOf(_bill: BillResponse): number {
  return SADILVAR_AMOUNT;
}

function totalDeductions(bill: BillResponse): number {
  return round2(
    (bill.savingDeduction  ?? 0) +
    sadilvarOf(bill) +
    (bill.advanceDeduction ?? 0) +
    (bill.otherDeductions  ?? 0),
  );
}

/** Net payable derived from components so सादिलवार is always ₹6. */
function computeNetAmount(bill: BillResponse): number {
  return round2((bill.totalAmount ?? 0) - totalDeductions(bill));
}

/** Morning / evening totals derived from entries. */
function computeSessionTotals(entries: MilkEntryResponse[]) {
  const morning = entries.filter(e => e.session === 'MORNING');
  const evening = entries.filter(e => e.session === 'EVENING');
  return {
    morningLiters: round2(morning.reduce((s, e) => s + (e.liters ?? 0), 0)),
    morningAmount: round2(morning.reduce((s, e) => s + (e.amount ?? 0), 0)),
    eveningLiters: round2(evening.reduce((s, e) => s + (e.liters ?? 0), 0)),
    eveningAmount: round2(evening.reduce((s, e) => s + (e.amount ?? 0), 0)),
  };
}

// ─── Period helpers ──────────────────────────────────────────────────────────

type Period = { label: string; fromDate: string; toDate: string };

function getMonthPeriods(year: number, month: number): Period[] {
  const days = getDaysInMonth(new Date(year, month));
  const pad  = (x: number) => String(x).padStart(2, '0');
  const m = pad(month + 1);
  return [
    { label: `01/${m}/${year} ते 10/${m}/${year}`,           fromDate: `${year}-${m}-01`, toDate: `${year}-${m}-10` },
    { label: `11/${m}/${year} ते 20/${m}/${year}`,           fromDate: `${year}-${m}-11`, toDate: `${year}-${m}-20` },
    { label: `21/${m}/${year} ते ${pad(days)}/${m}/${year}`, fromDate: `${year}-${m}-21`, toDate: `${year}-${m}-${pad(days)}` },
  ];
}

function groupEntriesByDate(entries: MilkEntryResponse[], from: string, to: string) {
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
    .map(day => {
      const d = format(day, 'yyyy-MM-dd');
      return {
        date: d,
        morning: entries.find(e => e.entryDate === d && e.session === 'MORNING'),
        evening: entries.find(e => e.entryDate === d && e.session === 'EVENING'),
      };
    })
    .filter(r => r.morning || r.evening);
}

// ─── Expand mixed bill into two single-type print cards ──────────────────────

interface PrintBill {
  bill: BillResponse;
  entries: MilkEntryResponse[];
}

function expandMixedForPrint(bill: BillResponse, entries: MilkEntryResponse[]): PrintBill[] {
  if (!isMixedBill(bill)) return [{ bill, entries }];

  const totalAmount = bill.totalAmount ?? 0;
  const cowAmount   = bill.cowTotalAmount ?? 0;
  const bufAmount   = bill.buffaloTotalAmount ?? 0;
  const cowRatio    = totalAmount > 0 ? cowAmount / totalAmount : 0;

  const savingDeduction  = bill.savingDeduction  ?? 0;
  const advanceDeduction = bill.advanceDeduction ?? 0;
  const otherDeductions  = bill.otherDeductions  ?? 0;

  const cowSaving  = round2(savingDeduction  * cowRatio);
  const bufSaving  = round2(savingDeduction  - cowSaving);
  const cowAdvance = round2(advanceDeduction * cowRatio);
  const bufAdvance = round2(advanceDeduction - cowAdvance);
  const cowOther   = round2(otherDeductions  * cowRatio);
  const bufOther   = round2(otherDeductions  - cowOther);

  const cowEntries = entries.filter(e => e.milkType === 'COW');
  const bufEntries = entries.filter(e => e.milkType === 'BUFFALO');
  const cowSession = computeSessionTotals(cowEntries);
  const bufSession = computeSessionTotals(bufEntries);

  const cowBill: BillResponse = {
    ...bill,
    totalLiters:        bill.cowTotalLiters ?? 0,
    totalAmount:        cowAmount,
    savingDeduction:    cowSaving,
    advanceDeduction:   cowAdvance,
    otherDeductions:    cowOther,
    sadilvar:           SADILVAR_AMOUNT,
    netAmount:          round2(cowAmount - cowSaving - cowAdvance - cowOther - SADILVAR_AMOUNT),
    buffaloTotalLiters: 0,
    buffaloTotalAmount: 0,
    morningTotalLiters: cowSession.morningLiters,
    morningTotalAmount: cowSession.morningAmount,
    eveningTotalLiters: cowSession.eveningLiters,
    eveningTotalAmount: cowSession.eveningAmount,
    entries:            cowEntries,
  };

  const bufBill: BillResponse = {
    ...bill,
    totalLiters:        bill.buffaloTotalLiters ?? 0,
    totalAmount:        bufAmount,
    savingDeduction:    bufSaving,
    advanceDeduction:   bufAdvance,
    otherDeductions:    bufOther,
    sadilvar:           SADILVAR_AMOUNT,
    netAmount:          round2(bufAmount - bufSaving - bufAdvance - bufOther - SADILVAR_AMOUNT),
    cowTotalLiters:     0,
    cowTotalAmount:     0,
    morningTotalLiters: bufSession.morningLiters,
    morningTotalAmount: bufSession.morningAmount,
    eveningTotalLiters: bufSession.eveningLiters,
    eveningTotalAmount: bufSession.eveningAmount,
    entries:            bufEntries,
  };

  return [
    { bill: cowBill, entries: cowEntries },
    { bill: bufBill, entries: bufEntries },
  ];
}

// ─── Print HTML builder (single-type bill card) ──────────────────────────────

function buildPrintBillHtml(bill: BillResponse, entries: MilkEntryResponse[]): string {
  const totalAmount      = bill.totalAmount       ?? 0;
  const totalLiters      = bill.totalLiters       ?? 0;
  const morningLiters    = bill.morningTotalLiters ?? 0;
  const morningAmount    = bill.morningTotalAmount ?? 0;
  const eveningLiters    = bill.eveningTotalLiters ?? 0;
  const eveningAmount    = bill.eveningTotalAmount ?? 0;
  const savingDeduction  = bill.savingDeduction    ?? 0;
  const sadilvar         = sadilvarOf(bill);
  const advanceDeduction = bill.advanceDeduction   ?? 0;
  const otherDeductions  = bill.otherDeductions    ?? 0;
  const netAmount        = computeNetAmount(bill);
  const cowLiters        = bill.cowTotalLiters     ?? 0;
  const cowAmount        = bill.cowTotalAmount     ?? 0;
  const bufLiters        = bill.buffaloTotalLiters ?? 0;
  const bufAmount        = bill.buffaloTotalAmount ?? 0;
  const savingPct        = savingDeduction > 0 && totalAmount > 0
    ? Math.round((savingDeduction / totalAmount) * 100) : 3;

  const grouped = groupEntriesByDate(entries, bill.fromDate, bill.toDate);

  const animalLabel = cowLiters > 0 && bufLiters > 0
    ? '🐄 गाय &amp; 🐃 म्हैस'
    : cowLiters > 0 ? '🐄 गाय (Cow)'
    : bufLiters > 0 ? '🐃 म्हैस (Buffalo)'
    : '';

  const rows = grouped.map(({ date, morning, evening }) => {
    const d = format(parseISO(date), 'dd/MM/yy');
    const mCells = morning
      ? `<td>${Number(morning.liters).toFixed(1)}</td><td>${Number(morning.fat).toFixed(1)}</td><td>${morning.ratePerLiter ?? 0}</td><td>${n(morning.amount)}</td>`
      : `<td colspan="4" style="text-align:center;color:#bbb;background:#fffbeb">-</td>`;
    const eCells = evening
      ? `<td>${Number(evening.liters).toFixed(1)}</td><td>${Number(evening.fat).toFixed(1)}</td><td>${evening.ratePerLiter ?? 0}</td><td>${n(evening.amount)}</td>`
      : `<td colspan="4" style="text-align:center;color:#bbb;background:#eef2ff">-</td>`;
    return `<tr><td class="dc">${d}</td>${mCells}<td class="dv"></td>${eCells}</tr>`;
  }).join('');

  const cowRow = cowLiters > 0
    ? `<tr class="ar"><td colspan="5" class="lbl">🐄 गाय: ${Number(cowLiters).toFixed(1)}लि = रु.${n(cowAmount)}</td><td class="dv"></td><td colspan="4"></td></tr>` : '';
  const bufRow = bufLiters > 0
    ? `<tr class="ar"><td colspan="5" class="lbl">🐃 म्हैस: ${Number(bufLiters).toFixed(1)}लि = रु.${n(bufAmount)}</td><td class="dv"></td><td colspan="4"></td></tr>` : '';

  const fromFmt  = format(parseISO(bill.fromDate), 'dd/MM/yy');
  const toFmt    = format(parseISO(bill.toDate),   'dd/MM/yy');
  const todayFmt = format(new Date(), 'dd/MM/yyyy');

  const deductLeft = `(-) ${savingPct}% बचत कपात: <b>-रु.${n(savingDeduction)}</b>`
    + (advanceDeduction > 0 ? `&nbsp;&nbsp;(-) आगाऊ: <b>-रु.${n(advanceDeduction)}</b>` : '')
    + (otherDeductions  > 0 ? `&nbsp;&nbsp;(-) इतर: <b>-रु.${n(otherDeductions)}</b>`   : '');

  const deductRight = `(-) सादिलवार: <b>-रु.${n(sadilvar)}</b>`;

  return `
<div class="bc">
  <div class="bh">
    <div class="bt">शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2</div>
    ${animalLabel ? `<div class="bat">${animalLabel}</div>` : ''}
    <div class="bm">
      <span>क्र: <b>${bill.farmerNumber}</b> &nbsp; नाव: <b>${bill.farmerName}</b>${bill.farmerVillage ? ` &nbsp; गाव: ${bill.farmerVillage}` : ''}</span>
      <span>दि: ${todayFmt}</span>
    </div>
    <div class="bm"><span>कालावधी: <b>${fromFmt} ते ${toFmt}</b></span></div>
  </div>
  <table class="bt2">
    <colgroup>
      <col style="width:44px">
      <col style="width:36px"><col style="width:28px"><col style="width:36px"><col style="width:42px">
      <col style="width:3px">
      <col style="width:36px"><col style="width:28px"><col style="width:36px"><col style="width:42px">
    </colgroup>
    <thead>
      <tr>
        <th class="dc" rowspan="2">दिनांक</th>
        <th colspan="4" class="sh mh">🌅 सकाळ</th>
        <th class="dv" rowspan="2"></th>
        <th colspan="4" class="sh eh">🌙 संध्याकाळ</th>
      </tr>
      <tr>
        <th>दूध(लि)</th><th>फॅट</th><th>दर</th><th>रक्कम</th>
        <th>दूध(लि)</th><th>फॅट</th><th>दर</th><th>रक्कम</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="10" class="empty">नोंदी नाहीत</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="sr">
        <td class="dc lbl">एकूण</td>
        <td><b>${Number(morningLiters).toFixed(1)}</b></td><td></td><td></td><td><b>रु.${n(morningAmount)}</b></td>
        <td class="dv"></td>
        <td><b>${Number(eveningLiters).toFixed(1)}</b></td><td></td><td></td><td><b>रु.${n(eveningAmount)}</b></td>
      </tr>
      ${cowRow}${bufRow}
      <tr class="tr2">
        <td colspan="5" class="lbl">
          एकूण दूध: <b>${Number(totalLiters).toFixed(1)}लि</b> &nbsp;|&nbsp; एकूण रक्कम: <b>रु.${n(totalAmount)}</b>
        </td>
        <td class="dv"></td>
        <td colspan="4" class="sav" style="padding:2px 3px">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:4px">
            <span style="text-align:left;white-space:nowrap">${deductLeft}</span>
            <span style="text-align:right;white-space:nowrap;font-weight:bold">${deductRight}</span>
          </div>
        </td>
      </tr>
      <tr class="nr">
        <td colspan="10"><b>निव्वळ देय रक्कम &nbsp;&nbsp;&nbsp; रु.${n(netAmount)}</b></td>
      </tr>
    </tfoot>
  </table>
</div>`;
}

// ─── Chunk bills 3-per-page (expands mixed bills first) ──────────────────────

function chunkBillsHtml(bills: BillResponse[], fe: Record<number, MilkEntryResponse[]>): string {
  // Expand every mixed bill into two single-type print cards.
  const printBills: PrintBill[] = [];
  for (const bill of bills) {
    const entries = fe[bill.farmerNumber] || bill.entries || [];
    printBills.push(...expandMixedForPrint(bill, entries));
  }

  let html = '';
  for (let i = 0; i < printBills.length; i += 3) {
    const chunk = printBills.slice(i, i + 3);
    const last  = i + 3 >= printBills.length;
    html += `<div style="page-break-after:${last ? 'auto' : 'always'};display:flex;flex-direction:column;gap:2px;padding:1mm 3mm">`;
    chunk.forEach(pb => { html += buildPrintBillHtml(pb.bill, pb.entries); });
    html += '</div>';
  }
  return html;
}

// ─── Payment Register HTML builder (split mixed into cow/buffalo sections) ──

function billShareForSection(bill: BillResponse, type: 'COW' | 'BUFFALO') {
  if (isMixedBill(bill)) {
    const totalAmount = bill.totalAmount ?? 0;
    const amount = type === 'COW' ? (bill.cowTotalAmount ?? 0) : (bill.buffaloTotalAmount ?? 0);
    const ratio  = totalAmount > 0 ? amount / totalAmount : 0;
    const liters = type === 'COW' ? (bill.cowTotalLiters ?? 0) : (bill.buffaloTotalLiters ?? 0);

    const saving  = round2((bill.savingDeduction  ?? 0) * ratio);
    const advance = round2((bill.advanceDeduction ?? 0) * ratio);
    const other   = round2((bill.otherDeductions  ?? 0) * ratio);
    const deduct  = round2(saving + advance + other + SADILVAR_AMOUNT);
    const net     = round2(amount - deduct);

    return { liters, amount, deduct, net, saving, advance, other };
  }
  return {
    liters: bill.totalLiters ?? 0,
    amount: bill.totalAmount ?? 0,
    deduct: totalDeductions(bill),
    net:    computeNetAmount(bill),
    saving:  bill.savingDeduction  ?? 0,
    advance: bill.advanceDeduction ?? 0,
    other:   bill.otherDeductions  ?? 0,
  };
}

function buildPaymentRegisterHtml(bills: BillResponse[], periodLabel: string): string {
  const todayFmt = format(new Date(), 'dd/MM/yyyy');

  const cowBills = bills.filter(b => (b.cowTotalLiters    ?? 0) > 0);
  const bufBills = bills.filter(b => (b.buffaloTotalLiters ?? 0) > 0);

  const renderRows = (list: BillResponse[], type: 'COW' | 'BUFFALO') =>
    list.map((b, idx) => {
      const s = billShareForSection(b, type);
      const deductParts: string[] = [];
      if (s.saving  > 0) deductParts.push(s.saving.toFixed(2));
      if (s.advance > 0) deductParts.push(s.advance.toFixed(2));
      if (s.other   > 0) deductParts.push(s.other.toFixed(2));
      if (s.deduct  > 0) deductParts.push(SADILVAR_AMOUNT.toFixed(2));
      return `
      <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="rc">${b.farmerNumber}</td>
        <td class="rn">${b.farmerName}${b.farmerVillage ? `<br><span class="rv">${b.farmerVillage}</span>` : ''}</td>
        <td class="rr">${s.liters.toFixed(1)}</td>
        <td class="rr">${s.amount.toFixed(2)}</td>
        <td class="rr rs">${deductParts.join(' + ') || '-'}</td>
        <td class="rr rnet">${s.net.toFixed(2)}</td>
        <td class="rsign"></td>
      </tr>`;
    }).join('');

  const renderTotal = (list: BillResponse[], label: string, type: 'COW' | 'BUFFALO') => {
    const shares = list.map(b => billShareForSection(b, type));
    const tl = shares.reduce((a, c) => a + c.liters, 0);
    const ta = shares.reduce((a, c) => a + c.amount, 0);
    const ts = shares.reduce((a, c) => a + c.deduct, 0);
    const tn = shares.reduce((a, c) => a + c.net,    0);
    return `<tr class="rtot">
      <td colspan="2" class="rn">${label} (${list.length} उत्पादक)</td>
      <td class="rr">${tl.toFixed(1)}</td><td class="rr">${ta.toFixed(2)}</td>
      <td class="rr rs">${ts.toFixed(2)}</td><td class="rr rnet">${tn.toFixed(2)}</td><td></td>
    </tr>`;
  };

  let sections = '';
  if (cowBills.length > 0) {
    sections += `<tr class="rsec"><td colspan="7">१ गाय (Cow)</td></tr>`
             + renderRows(cowBills, 'COW')
             + renderTotal(cowBills, 'एकूण गाय', 'COW');
  }
  if (bufBills.length > 0) {
    sections += `<tr class="rsec"><td colspan="7">२ म्हैस (Buffalo)</td></tr>`
             + renderRows(bufBills, 'BUFFALO')
             + renderTotal(bufBills, 'एकूण म्हैस', 'BUFFALO');
  }

  // Grand totals: sum section-level numbers so mixed bills correctly count
  // both a cow-share and a buffalo-share (2×₹6 सादिलवार).
  const grandL = bills.reduce((a, b) => a + (b.totalLiters ?? 0), 0);
  const grandA = bills.reduce((a, b) => a + (b.totalAmount ?? 0), 0);
  let grandS = 0, grandN = 0;
  for (const b of bills) {
    if (isMixedBill(b)) {
      const cow = billShareForSection(b, 'COW');
      const buf = billShareForSection(b, 'BUFFALO');
      grandS += cow.deduct + buf.deduct;
      grandN += cow.net    + buf.net;
    } else {
      grandS += totalDeductions(b);
      grandN += computeNetAmount(b);
    }
  }
  grandS = round2(grandS);
  grandN = round2(grandN);

  return `
<div style="font-family:Arial,sans-serif;font-size:18px;padding:3mm">
  <div style="text-align:center;margin-bottom:6px;border-bottom:2px solid #000;padding-bottom:6px">
    <div style="font-size:22px;font-weight:bold;color:#000">शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2</div>
    <div style="font-size:19px;font-weight:bold;margin-top:2px;color:#000">पेमेंट रजिस्टर &nbsp;|&nbsp; कालावधी: ${periodLabel}</div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:17px;margin-bottom:4px">
    <span>तारीख: ${todayFmt}</span><span>एकूण उत्पादक: ${bills.length}</span>
  </div>
  <table class="rt">
    <thead>
      <tr class="rh">
        <th>कोड</th><th>उत्पादकाचे नाव</th>
        <th>लिटर</th><th>एकूण बिल</th><th>एकूण कपात</th><th>निव्वळ आदा</th><th>सही</th>
      </tr>
    </thead>
    <tbody>
      ${sections}
      <tr class="rgrand">
        <td colspan="2" style="text-align:left;padding-left:6px;font-weight:bold">एकूण सर्व (${bills.length} उत्पादक)</td>
        <td class="rr">${grandL.toFixed(1)}</td><td class="rr">${grandA.toFixed(2)}</td>
        <td class="rr rs">${grandS.toFixed(2)}</td><td class="rr rnet">${grandN.toFixed(2)}</td><td></td>
      </tr>
    </tbody>
  </table>
</div>`;
}

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 5mm; }
  body { font-family: Arial, sans-serif; font-size: 9.0px; color: #111; background: #fff; }
  .pc { text-align: center; padding: 6px; background: #f0fdf4; margin-bottom: 5px; }
  .pc button { background: #166534; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; font-size: 12px; cursor: pointer; margin: 0 3px; }
  .bc  { border: 1px solid #166534; border-radius: 2px; padding: 4px 8px; page-break-inside: avoid; }
  .bt  { font-size: 11px; font-weight: bold; color: #166534; text-align: center; margin-bottom: 1px; }
  .bm  { display: flex; justify-content: space-between; font-size: 8.5px; color: #333; margin-top: 1px; }
  .bh  { border-bottom: 1px solid #166534; padding-bottom: 3px; margin-bottom: 3px; }
  .bat { text-align: center; font-size: 8.5px; font-weight: bold; color: #166534; background: #f0fdf4; border-radius: 2px; padding: 1px 4px; margin: 1px 0; border: 1px dashed #86efac; }
  .bt2 { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  .bt2 th, .bt2 td { border: 0.5px solid #ccc; padding: 2px 3px; text-align: right; white-space: nowrap; overflow: hidden; }
  .dc  { text-align: center !important; font-weight: bold; color: #444; }
  .sh  { text-align: center !important; font-weight: bold; }
  .mh  { background: #fffbeb; color: #92400e; }
  .eh  { background: #eef2ff; color: #3730a3; }
  .bt2 thead th { background: #f3f4f6; font-size: 8.5px; }
  .bt2 tbody tr:nth-child(even) { background: #fafafa; }
  .dv  { width: 2px !important; background: #166534 !important; border: none !important; padding: 0 !important; }
  .sr td  { background: #f0fdf4; border-top: 1px solid #166534; font-size: 8.5px; }
  .ar td  { background: #fef9ec; font-size: 8.5px; color: #555; }
  .tr2 td { background: #f9fafb; font-size: 8.5px; padding: 2px 3px; }
  .nr td  { background: #166534; color: #000000; font-weight: bold; font-size: 9px; text-align: center !important; padding: 3px; }
  .lbl   { text-align: left !important; }
  .sav   { color: #c2410c; }
  .empty { text-align: center !important; color: #bbb; }

  /* ── Payment Register — Black & White for printing ── */
  .rt  { width:100%; border-collapse:collapse; font-size:14px; margin-top:4px; }
  .rt th { border:1.5px solid #000; padding:5px 7px; font-size:13px; background:#fff; color:#000; }
  .rt td { border:1px solid #000; padding:5px 7px; font-size:14px; background:#fff; color:#000; }
  .rh  { background:#fff !important; color:#000 !important; font-weight:bold; text-align:center; border-bottom:2px solid #000; }
  .rc  { text-align:center !important; }
  .rr  { text-align:right !important; }
  .rn  { text-align:left !important; }
  .rv  { font-size:12px; color:#444; }
  .rs  { color:#000; }
  .rnet{ font-weight:bold; color:#000; }
  .row-even td { background:#fff !important; }
  .row-odd  td { background:#f5f5f5 !important; }
  .rsec td { background:#e8e8e8 !important; font-weight:bold; color:#000 !important; font-size:14px; padding:4px 8px; border:1.5px solid #000; }
  .rtot td { background:#e0e0e0 !important; font-weight:bold; border-top:2px solid #000; border-bottom:2px solid #000; font-size:14px; color:#000 !important; }
  .rgrand td { background:#fff !important; color:#000 !important; font-weight:bold; font-size:14px; padding:5px 7px; border-top:3px double #000; border-bottom:2px solid #000; }
  .rsign { width:80px; min-width:80px; }
  @media print { .pc { display: none; } }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function BillsPage() {
  const { activeBranchCode } = useBranch();

  const now = new Date();
  const [selYear,       setSelYear]       = useState(getYear(now));
  const [selMonth,      setSelMonth]      = useState(getMonth(now));
  const [selPeriod,     setSelPeriod]     = useState<number>(
    () => now.getDate() <= 10 ? 0 : now.getDate() <= 20 ? 1 : 2
  );
  const [advance]       = useState('');
  const [other]         = useState('');
  const [bills,         setBills]         = useState<BillResponse[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [regPdfLoading, setRegPdfLoading] = useState(false);
  const [expanded,      setExpanded]      = useState<number | null>(null);
  const [fe,            setFe]            = useState<Record<number, MilkEntryResponse[]>>({});
  const [ledgerMap,     setLedgerMap]     = useState<Record<number, LedgerResponse>>({});

  const MONTHS = ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून','जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर'];
  const YEARS  = [2024, 2025, 2026, 2027];

  const periods = getMonthPeriods(selYear, selMonth);
  const active  = periods[selPeriod];

  const fetchEntries = async (filtered: BillResponse[], from: string, to: string) => {
    const map: Record<number, MilkEntryResponse[]> = {};
    await Promise.all(filtered.map(async b => {
      try {
        map[b.farmerNumber] = await milkEntryAPI.getByFarmerAndRange(activeBranchCode, b.farmerNumber, from, to);
      } catch {
        map[b.farmerNumber] = b.entries || [];
      }
    }));
    return map;
  };

  const fetchLedgers = async (filtered: BillResponse[]) => {
    const map: Record<number, LedgerResponse> = {};
    await Promise.all(filtered.map(async b => {
      try {
        map[b.farmerNumber] = await ledgerAPI.get(activeBranchCode, b.farmerNumber);
      } catch {
        // no ledger for this farmer — bill will just show रु.0.00
      }
    }));
    return map;
  };

  const generateBills = async () => {
    setLoading(true);
    try {
      const data = await billAPI.generate(activeBranchCode, {
        fromDate:         active.fromDate,
        toDate:           active.toDate,
        advanceDeduction: advance ? +advance : 0,
        otherDeductions:  other   ? +other   : 0,
        savingPercent:    3,
      });
      const filtered = data.filter(b => (b.totalLiters ?? 0) > 0);
      setBills(filtered);
      const map = await fetchEntries(filtered, active.fromDate, active.toDate);
      setFe(map);
      const lm = await fetchLedgers(filtered);
      setLedgerMap(lm);
      toast.success(`${filtered.length} बिले तयार झाली`);
    } catch (err) {
      console.error(err);
      toast.error('बिले तयार करताना error आली');
    } finally {
      setLoading(false);
    }
  };

  const handlePDF = async () => {
    if (!bills.length) return;
    setPdfLoading(true);
    try {
      const map = Object.keys(fe).length ? fe : await fetchEntries(bills, active.fromDate, active.toDate);
      setFe(map);
      const lm = Object.keys(ledgerMap).length ? ledgerMap : await fetchLedgers(bills);
      setLedgerMap(lm);
      generateBillsPDF(bills, map, active.label, lm);
      toast.success('PDF डाउनलोड झाले!');
    } catch (err) {
      console.error(err);
      toast.error('PDF तयार करताना error आली');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleRegisterPDF = async () => {
    if (!bills.length) return;
    setRegPdfLoading(true);
    try {
      const lm = Object.keys(ledgerMap).length ? ledgerMap : await fetchLedgers(bills);
      setLedgerMap(lm);
      await generatePaymentRegisterPDF(bills, active.label, lm);
      toast.success('पेमेंट रजिस्टर PDF डाउनलोड झाले!');
    } catch (err) {
      console.error(err);
      toast.error('पेमेंट रजिस्टर PDF तयार करताना error आली');
    } finally {
      setRegPdfLoading(false);
    }
  };

  const openPrintWindow = (htmlBody: string, title: string) => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Popup blocked! कृपया popups allow करा.'); return; }
    w.document.open();
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${PRINT_CSS}</style></head><body>` +
      `<div class="pc">` +
      `<button onclick="window.print()">🖨️ प्रिंट करा</button>` +
      `<button onclick="window.close()" style="margin-left:8px">✖ बंद करा</button>` +
      `</div>${htmlBody}</body></html>`
    );
    w.document.close();
  };

  const printAll      = () => openPrintWindow(chunkBillsHtml(bills, fe), 'सर्व बिले');
  const printOne      = (bill: BillResponse) => {
    // For a mixed bill, print both expanded single-type cards together.
    const entries = fe[bill.farmerNumber] || bill.entries || [];
    const expanded = expandMixedForPrint(bill, entries);
    const body = expanded
      .map(pb => buildPrintBillHtml(pb.bill, pb.entries))
      .join('<div style="height:4px"></div>');
    openPrintWindow(`<div style="padding:4px">${body}</div>`, `बिल - ${bill.farmerName}`);
  };
  const printRegister = () => {
    if (!bills.length) return;
    openPrintWindow(buildPaymentRegisterHtml(bills, active.label), 'पेमेंट रजिस्टर');
  };

  // Grand totals — must use the same section-aware maths as the register.
  const grand = (() => {
    let liters = 0, amount = 0, saving = 0, sadilvar = 0, net = 0;
    for (const b of bills) {
      liters += (b.totalLiters ?? 0);
      amount += (b.totalAmount ?? 0);
      saving += (b.savingDeduction ?? 0);
      if (isMixedBill(b)) {
        const cow = billShareForSection(b, 'COW');
        const buf = billShareForSection(b, 'BUFFALO');
        sadilvar += SADILVAR_AMOUNT * 2;
        net += cow.net + buf.net;
      } else {
        sadilvar += SADILVAR_AMOUNT;
        net += computeNetAmount(b);
      }
    }
    return { liters, amount, saving, sadilvar, net };
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Period & Controls ── */}
      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
        <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2">
          <Calendar size={18} /> बिल कालावधी निवडा
        </h3>

        <div className="flex flex-wrap gap-3 mb-4">
          <select value={selYear} onChange={e => { setSelYear(+e.target.value); setBills([]); }}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-green-400 outline-none">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); setBills([]); }}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-green-400 outline-none">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {periods.map((p, i) => (
            <button key={i} onClick={() => { setSelPeriod(i); setBills([]); }}
              className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all text-left ${
                selPeriod === i
                  ? 'border-green-600 bg-green-700 text-white shadow-md'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-green-300 hover:bg-green-50'}`}>
              <div className="text-xs opacity-70 mb-0.5">बिल {i + 1}</div>
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="md:col-span-2 flex items-end">
            <div className="w-full bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-2xl">💰</span>
              <div>
                <p className="text-xs font-semibold text-orange-700">बचत कपात + सादिलवार</p>
                <p className="font-bold text-orange-800 text-sm">३% बचत + ₹६ सादिलवार वजा केली जाईल</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={generateBills} disabled={loading || !activeBranchCode}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold">
            <FileText size={16} />
            {loading ? 'तयार होत आहे...' : 'बिले तयार करा'}
          </button>

          {bills.length > 0 && (<>
            <button onClick={printAll}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-5 py-2.5 rounded-xl font-semibold">
              <Printer size={16} /> प्रिंट (३/पान)
            </button>
            <button onClick={handlePDF} disabled={pdfLoading}
              className="flex items-center gap-2 bg-rose-700 hover:bg-rose-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold">
              <Download size={16} />
              {pdfLoading ? 'PDF होत आहे...' : 'PDF डाउनलोड (३/पान)'}
            </button>
            <button onClick={printRegister}
              className="flex items-center gap-2 bg-purple-700 hover:bg-purple-800 text-white px-5 py-2.5 rounded-xl font-semibold">
              <Printer size={16} /> पेमेंट रजिस्टर प्रिंट
            </button>
            <button onClick={handleRegisterPDF} disabled={regPdfLoading}
              className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl font-semibold">
              <Download size={16} />
              {regPdfLoading ? 'PDF होत आहे...' : 'रजिस्टर PDF डाउनलोड'}
            </button>
          </>)}
        </div>
      </div>

      {/* ── Summary ── */}
      {bills.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'उत्पादक',        value: String(bills.length) },
            { label: 'एकूण दूध',      value: `${grand.liters.toFixed(1)} लि` },
            { label: '३% बचत कपात',   value: `₹${grand.saving.toFixed(0)}`,   color: 'text-orange-700' },
            { label: 'सादिलवार कपात', value: `₹${grand.sadilvar.toFixed(0)}`, color: 'text-red-600'    },
            { label: 'निव्वळ रक्कम',  value: `₹${grand.net.toFixed(0)}`,      color: 'text-green-800'  },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-amber-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 font-semibold">{s.label}</p>
              <p className={`text-xl font-bold ${s.color ?? 'text-gray-800'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bills List ── */}
      {bills.map(bill => {
        const entries = fe[bill.farmerNumber] || bill.entries || [];
        const grouped = groupEntriesByDate(entries, bill.fromDate, bill.toDate);
        const savingPct = (bill.savingDeduction ?? 0) > 0 && (bill.totalAmount ?? 0) > 0
          ? Math.round(((bill.savingDeduction ?? 0) / (bill.totalAmount ?? 1)) * 100)
          : 3;
        const sadilvar = sadilvarOf(bill);
        const netAmount = computeNetAmount(bill);
        const mixed = isMixedBill(bill);

        return (
          <div key={bill.id} className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">

            {/* Header row */}
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-amber-50"
              onClick={() => setExpanded(expanded === bill.id ? null : bill.id)}>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-800 text-lg shrink-0">
                  {bill.farmerNumber}
                </span>
                <div>
                  <p className="font-bold text-gray-900">{bill.farmerName}</p>
                  <p className="text-xs text-gray-400">
                    {format(parseISO(bill.fromDate), 'dd/MM/yy')} → {format(parseISO(bill.toDate), 'dd/MM/yy')}
                    &nbsp;·&nbsp; {Number(bill.totalLiters ?? 0).toFixed(1)} लि
                    {(bill.cowTotalLiters     ?? 0) > 0 && <span className="ml-1 text-yellow-700">🐄{Number(bill.cowTotalLiters).toFixed(1)}लि</span>}
                    {(bill.buffaloTotalLiters ?? 0) > 0 && <span className="ml-1 text-indigo-700">🐃{Number(bill.buffaloTotalLiters).toFixed(1)}लि</span>}
                    {mixed && <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">२ बिले</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <p className="text-xs text-orange-500 font-semibold">
                    ३% बचत + सादि{mixed ? ' (×2)' : ''}
                  </p>
                  <p className="text-sm font-bold text-orange-700">
                    -₹{n(bill.savingDeduction, 0)} + -₹{n(mixed ? sadilvar * 2 : sadilvar, 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">निव्वळ रक्कम</p>
                  <p className="text-xl font-bold text-green-700">₹{n(netAmount, 0)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); printOne(bill); }}
                  className="p-2 text-gray-400 hover:text-green-700 hover:bg-green-50 rounded-lg" title="प्रिंट">
                  <Printer size={16} />
                </button>
                {expanded === bill.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>

            {/* Expanded date-wise table */}
            {expanded === bill.id && (
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-center bg-gray-100 border border-gray-200" rowSpan={2}>दिनांक</th>
                      <th colSpan={4} className="px-2 py-1.5 text-center bg-amber-100 text-amber-800 border border-gray-200">🌅 सकाळ</th>
                      <th className="w-1.5 bg-green-700 border-0 p-0" rowSpan={2}></th>
                      <th colSpan={4} className="px-2 py-1.5 text-center bg-indigo-100 text-indigo-800 border border-gray-200">🌙 संध्याकाळ</th>
                    </tr>
                    <tr className="bg-gray-50 text-gray-500">
                      {['दूध','फॅट','दर','रक्कम','दूध','फॅट','दर','रक्कम'].map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-right border border-gray-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(({ date, morning, evening }) => (
                      <tr key={date} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-center font-bold text-gray-700 bg-gray-50 border border-gray-200">
                          {format(parseISO(date), 'dd/MM/yy')}
                        </td>
                        {morning ? (
                          <>
                            <td className="px-2 py-1.5 text-right bg-amber-50/50 border border-gray-100">
                              <span className="text-xs">{morning.animalType === 'COW' ? '🐄' : '🐃'}</span>{Number(morning.liters).toFixed(1)}
                            </td>
                            <td className="px-2 py-1.5 text-right bg-amber-50/50 border border-gray-100">{Number(morning.fat).toFixed(1)}</td>
                            <td className="px-2 py-1.5 text-right bg-amber-50/50 border border-gray-100">₹{morning.ratePerLiter ?? 0}</td>
                            <td className="px-2 py-1.5 text-right font-semibold bg-amber-50/50 border-r-2 border-r-green-700">₹{n(morning.amount)}</td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-2 py-1.5 text-center text-gray-300 bg-amber-50/30 border-r-2 border-r-green-700">-</td>
                        )}
                        <td className="w-1.5 bg-green-700 p-0"></td>
                        {evening ? (
                          <>
                            <td className="px-2 py-1.5 text-right bg-indigo-50/50 border border-gray-100">
                              <span className="text-xs">{evening.animalType === 'COW' ? '🐄' : '🐃'}</span>{Number(evening.liters).toFixed(1)}
                            </td>
                            <td className="px-2 py-1.5 text-right bg-indigo-50/50 border border-gray-100">{Number(evening.fat).toFixed(1)}</td>
                            <td className="px-2 py-1.5 text-right bg-indigo-50/50 border border-gray-100">₹{evening.ratePerLiter ?? 0}</td>
                            <td className="px-2 py-1.5 text-right font-semibold bg-indigo-50/50">₹{n(evening.amount)}</td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-2 py-1.5 text-center text-gray-300 bg-indigo-50/30">-</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-green-300 font-bold text-xs">
                      <td className="px-2 py-2 text-center bg-amber-50 text-amber-800">सकाळ</td>
                      <td className="px-2 py-2 text-right bg-amber-50 text-amber-800">{Number(bill.morningTotalLiters ?? 0).toFixed(1)}लि</td>
                      <td colSpan={2} className="bg-amber-50"></td>
                      <td className="px-2 py-2 text-right bg-amber-50 text-amber-800 border-r-2 border-r-green-700">₹{n(bill.morningTotalAmount)}</td>
                      <td className="bg-green-700 p-0"></td>
                      <td className="px-2 py-2 text-right bg-indigo-50 text-indigo-800">{Number(bill.eveningTotalLiters ?? 0).toFixed(1)}लि</td>
                      <td colSpan={2} className="bg-indigo-50"></td>
                      <td className="px-2 py-2 text-right bg-indigo-50 text-indigo-800">₹{n(bill.eveningTotalAmount)}</td>
                    </tr>
                    {(bill.cowTotalLiters ?? 0) > 0 && (
                      <tr className="bg-yellow-50 text-xs">
                        <td colSpan={10} className="px-3 py-1 text-yellow-800">🐄 गाय: {Number(bill.cowTotalLiters).toFixed(1)}लि = ₹{n(bill.cowTotalAmount)}</td>
                      </tr>
                    )}
                    {(bill.buffaloTotalLiters ?? 0) > 0 && (
                      <tr className="bg-indigo-50 text-xs">
                        <td colSpan={10} className="px-3 py-1 text-indigo-800">🐃 म्हैस: {Number(bill.buffaloTotalLiters).toFixed(1)}लि = ₹{n(bill.buffaloTotalAmount)}</td>
                      </tr>
                    )}
                    <tr className="bg-green-50 font-bold border-t border-green-200 text-xs">
                      <td colSpan={5} className="px-3 py-2 text-green-800 border-r-2 border-r-green-700">
                        एकूण दूध: {Number(bill.totalLiters ?? 0).toFixed(1)}लि &nbsp;|&nbsp; एकूण रक्कम: ₹{n(bill.totalAmount)}
                      </td>
                      <td className="bg-green-700 p-0"></td>
                      <td colSpan={4} className="px-3 py-2 text-orange-700">
                        <div className="flex justify-between items-center w-full gap-2">
                          <span className="whitespace-nowrap">
                            💰 (-) {savingPct}% बचत कपात: <span className="font-bold">-₹{n(bill.savingDeduction)}</span>
                            {(bill.advanceDeduction ?? 0) > 0 && <span className="ml-2">(-) आगाऊ: <b>-₹{n(bill.advanceDeduction)}</b></span>}
                            {(bill.otherDeductions  ?? 0) > 0 && <span className="ml-2">(-) इतर: <b>-₹{n(bill.otherDeductions)}</b></span>}
                          </span>
                          <span className="whitespace-nowrap font-bold text-red-600">
                            (-) सादिलवार: -₹{n(sadilvar)}{mixed ? ' ×२' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-green-800 text-white font-bold">
                      <td colSpan={10} className="px-3 py-3 text-center text-sm">
                        ✅ निव्वळ देय रक्कम &nbsp;&nbsp; ₹{n(netAmount)}
                        <span className="text-xs font-normal opacity-75 ml-2">
                          (एकूण रक्कम − {savingPct}% बचत − ₹{n(sadilvar)}{mixed ? '×२' : ''} सादिलवार)
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {bills.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-amber-100 p-12 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>वर कालावधी निवडा आणि बिले तयार करा</p>
        </div>
      )}
    </div>
  );
}