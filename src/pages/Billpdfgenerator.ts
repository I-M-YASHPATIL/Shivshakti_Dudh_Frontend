import jsPDF from 'jspdf';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import type { BillResponse, LedgerResponse, MilkEntryResponse } from '../types/dairyTypes';

// ─── helpers ──────────────────────────────────────────────────────────────────

function groupByDate(entries: MilkEntryResponse[], from: string, to: string) {
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
    .map(day => {
      const d = format(day, 'yyyy-MM-dd');
      return {
        date: d,
        morning: entries.find(e => e.entryDate === d && e.session === 'MORNING'),
        evening: entries.find(e => e.entryDate === d && e.session === 'EVENING'),
      };
    });
}

const n = (v: number | undefined | null, decimals = 2): string =>
  ((v ?? 0)).toFixed(decimals);

// ─── shared page CSS ──────────────────────────────────────────────────────────

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap');

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    line-height: 1.4 !important;
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
  }

  body {
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Arial Unicode MS', Arial, sans-serif;
    font-size: 12px;
    color: #000;
    background: #fff;
  }

  .page {
    width: 794px;
    height: 1123px;
    padding: 4px 8px 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 0px;
    background: #fff;
    overflow: hidden;
  }

  /* ── Bill card styles ── */
  .bc {
    border: none;
    padding: 0px 6px 3px 6px;
    flex-shrink: 0;
    margin-bottom: 0px;
    margin-top: 0px;
  }
  /* Only the 2nd+ bill card gets separator and top spacing */
  .bc + .bc {
    border-top: 2px solid #000 !important;
    padding-top: 3px !important;
    margin-top: 2px !important;
  }
  /* First bill card on page: no top padding/margin at all */
  .bc:first-child {
    padding-top: 0px !important;
    margin-top: 0px !important;
  }
  .btitle {
    font-size: 15px !important;
    font-weight: bold;
    color: #000;
    text-align: center;
    margin-bottom: 1px;
  }
  .bm {
    display: flex;
    justify-content: space-between;
    font-size: 13px !important;
    color: #000;
    margin-top: 1px;
  }
  .bh {
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 2px 0 3px 0;
    margin-bottom: 3px;
  }
  .bat {
    text-align: center;
    font-size: 12px !important;
    font-weight: bold;
    color: #000;
    padding: 0px 4px;
    margin: 0px 0;
  }
  .bt2 { width: 100%; border-collapse: collapse; font-size: 12px !important; table-layout: fixed; }
  .bt2 th {
    border: none !important;
    padding: 2px 3px 1px 3px !important;
    text-align: right;
    white-space: nowrap;
    overflow: visible;
    font-size: 12px !important;
    background: #fff;
    color: #000;
  }
  .bt2 td {
    border: none !important;
    padding: 1px 3px 1px 3px !important;
    text-align: right;
    white-space: nowrap;
    overflow: visible;
    font-size: 12px !important;
    background: #fff;
    color: #000;
  }
  .dc  { text-align: center !important; font-weight: bold; }
  .sh  { text-align: center !important; font-weight: bold; }
  .mh  { background: #fff !important; }
  .eh  { background: #fff !important; }
  .bt2 thead th { background: #fff !important; }
  .bt2 tbody tr:nth-child(even) td { background: #fff !important; }
  .dv  { width: 4px !important; background: #fff !important; border: none !important; padding: 0 !important; }
  .sr td  { background: #fff !important; border: none !important; border-top: 1px solid #000 !important; }
  .ar td  { background: #fff !important; }
  .tr2 td { background: #fff !important; padding: 1px 3px 1px 3px !important; }
  .nr td  {
    background: #fff !important;
    color: #000 !important;
    font-weight: bold !important;
    font-size: 14px !important;
    text-align: center !important;
    padding: 2px 3px 1px 3px !important;
    border: none !important;
  }
  .lbl  { text-align: left !important; }
  .sav  { color: #000; }
  .empty{ text-align: center !important; color: #aaa; }
  .num  { font-size: 13px !important; font-weight: 600; }
  .deduct-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 6px;
  }
  .deduct-left  { text-align: left;  white-space: nowrap; }
  .deduct-right { text-align: right; white-space: nowrap; font-weight: bold; }

  /* ── Payment Register styles ── */
  .rt  { width: 100%; border-collapse: collapse; font-size: 17px !important; margin-top: 4px; }

  .rt th {
    border: 1px solid #000;
    padding: 8px 7px 7px 7px !important;
    font-size: 17px !important;
    background: #fff !important;
    color: #000 !important;
    font-weight: bold;
  }

  .rt td {
    border: none !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
    padding: 11px 7px 10px 7px !important;
    font-size: 17px !important;
    background: #fff !important;
    color: #000 !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rh   { text-align: center; font-weight: bold; border-bottom: 2px solid #000 !important; }
  .rc   { text-align: center !important; }
  .rr   { text-align: right  !important; }
  .rn   { text-align: left   !important; }
  .rs   { color: #000; }
  .rnet { font-weight: bold; }

  .rsec td {
    background: #e0e0e0 !important;
    color: #000 !important;
    font-weight: bold;
    font-size: 17px !important;
    padding: 8px 12px 7px 12px !important;
    border-top: 1.5px solid #000 !important;
    border-bottom: 1px solid #000 !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
  }

  .rtot td {
    background: #f0f0f0 !important;
    color: #000 !important;
    font-weight: bold;
    font-size: 17px !important;
    padding: 8px 7px 7px 7px !important;
    border-top: 1.5px solid #000 !important;
    border-bottom: 1.5px solid #000 !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
  }

  .rcow td {
    background: #fffbeb !important;
    color: #000 !important;
    font-weight: bold;
    font-size: 16px !important;
    padding: 8px 9px 7px 9px !important;
    border-top: 1px solid #000 !important;
    border-bottom: 1px solid #000 !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
  }

  .rbuf td {
    background: #eef2ff !important;
    color: #000 !important;
    font-weight: bold;
    font-size: 16px !important;
    padding: 8px 9px 7px 9px !important;
    border-top: 1px solid #000 !important;
    border-bottom: 1px solid #000 !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
  }

  .rgrand td {
    background: #fff !important;
    color: #000 !important;
    font-weight: bold;
    font-size: 17px !important;
    padding: 9px 9px 8px 9px !important;
    border-top: 3px double #000 !important;
    border-bottom: 2px solid #000 !important;
    border-left: 0.5px solid #000 !important;
    border-right: 0.5px solid #000 !important;
  }

  .row-alt td { background: #fff !important; }
  .rsign { width: 110px; }
`;

// ─── bill card HTML ───────────────────────────────────────────────────────────

function buildBillHtml(bill: BillResponse, entries: MilkEntryResponse[]): string {
  const totalAmount      = bill.totalAmount       ?? 0;
  const totalLiters      = bill.totalLiters       ?? 0;
  const morningLiters    = bill.morningTotalLiters ?? 0;
  const morningAmount    = bill.morningTotalAmount ?? 0;
  const eveningLiters    = bill.eveningTotalLiters ?? 0;
  const eveningAmount    = bill.eveningTotalAmount ?? 0;
  const savingDeduction  = bill.savingDeduction    ?? 0;
  const sadilvar         = bill.sadilvar           ?? 5;
  const advanceDeduction = bill.advanceDeduction   ?? 0;
  const otherDeductions  = bill.otherDeductions    ?? 0;
  const netAmount        = bill.netAmount          ?? 0;
  const cowLiters        = bill.cowTotalLiters     ?? 0;
  const bufLiters        = bill.buffaloTotalLiters ?? 0;

  const savingPct = savingDeduction > 0 && totalAmount > 0
    ? Math.round((savingDeduction / totalAmount) * 100) : 3;

  const animalLabel =
    cowLiters > 0 && bufLiters > 0 ? 'गाय & म्हैस'
    : cowLiters > 0 ? 'गाय (Cow)'
    : bufLiters > 0 ? 'म्हैस (Buffalo)'
    : '';

  const grouped = groupByDate(entries, bill.fromDate, bill.toDate);
  const fromFmt = format(parseISO(bill.fromDate), 'dd/MM/yy');
  const toFmt   = format(parseISO(bill.toDate),   'dd/MM/yy');

  // Show the SNF column only when at least one entry in this bill's period has an SNF value.
  const hasSnf = grouped.some(({ morning, evening }) =>
    (morning?.snf != null) || (evening?.snf != null)
  );
  const sessionColspan = hasSnf ? 5 : 4;
  const totalCols       = hasSnf ? 11 : 9;

  const rows = grouped.map(({ date, morning, evening }) => {
    const d = format(parseISO(date), 'dd/MM/yy');
    const mCells = morning
      ? `<td class="num">${Number(morning.liters).toFixed(1)}</td><td class="num">${Number(morning.fat).toFixed(1)}</td>${hasSnf ? `<td class="num">${morning.snf != null ? Number(morning.snf).toFixed(1) : '-'}</td>` : ''}<td class="num">${Number(morning.ratePerLiter ?? 0).toFixed(1)}</td><td class="num">${n(morning.amount)}</td>`
      : `<td colspan="${sessionColspan}" style="text-align:center;color:#aaa">-</td>`;
    const eCells = evening
      ? `<td class="num">${Number(evening.liters).toFixed(1)}</td><td class="num">${Number(evening.fat).toFixed(1)}</td>${hasSnf ? `<td class="num">${evening.snf != null ? Number(evening.snf).toFixed(1) : '-'}</td>` : ''}<td class="num">${Number(evening.ratePerLiter ?? 0).toFixed(1)}</td><td class="num">${n(evening.amount)}</td>`
      : `<td colspan="${sessionColspan}" style="text-align:center;color:#aaa">-</td>`;
    return `<tr><td class="dc">${d}</td>${mCells}${eCells}</tr>`;
  }).join('');

  const deductLeft = `(-) ${savingPct}% बचत कपात: <b>-रु.${n(savingDeduction)}</b>`
    + (advanceDeduction > 0 ? `&nbsp;&nbsp;(-) आगाऊ: <b>-रु.${n(advanceDeduction)}</b>` : '')
    + (otherDeductions  > 0 ? `&nbsp;&nbsp;(-) इतर: <b>-रु.${n(otherDeductions)}</b>`   : '');

  const deductRight = `(-) सादिलवार: <b>-रु.${n(sadilvar)}</b>`;

  const colgroupCols = hasSnf
    ? `<col style="width:42px">
      <col style="width:32px"><col style="width:24px"><col style="width:28px"><col style="width:28px"><col style="width:48px">
      <col style="width:32px"><col style="width:24px"><col style="width:28px"><col style="width:28px"><col style="width:48px">`
    : `<col style="width:42px">
      <col style="width:34px"><col style="width:26px"><col style="width:34px"><col style="width:52px">
      <col style="width:34px"><col style="width:26px"><col style="width:34px"><col style="width:52px">`;

  return `
<div class="bc">
  <div class="bh">
    <div class="btitle">शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2</div>
    <div class="bm">
      <span>क्र: <b>${bill.farmerNumber}</b> &nbsp; उत्पादकाचे नाव - <b style="font-size:14px !important">${bill.farmerName}</b> ${animalLabel ? `&nbsp; ${animalLabel}` : ''}</span>
      <span>कालावधी: <b>${fromFmt} ते ${toFmt}</b></span>
    </div>
  </div>
  <table class="bt2">
    <colgroup>
      ${colgroupCols}
    </colgroup>
    <thead>
      <tr>
        <th class="dc" rowspan="2">दिनांक</th>
        <th colspan="${sessionColspan}" class="sh mh">सकाळ</th>
        <th colspan="${sessionColspan}" class="sh eh">संध्याकाळ</th>
      </tr>
      <tr>
        <th class="mh">दूध(लि)</th><th class="mh">फॅट</th>${hasSnf ? `<th class="mh">SNF</th>` : ''}<th class="mh">दर</th><th class="mh">रक्कम</th>
        <th class="eh">दूध(लि)</th><th class="eh">फॅट</th>${hasSnf ? `<th class="eh">SNF</th>` : ''}<th class="eh">दर</th><th class="eh">रक्कम</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${totalCols}" class="empty">नोंदी नाहीत</td></tr>`}
    </tbody>
    <tfoot>
      <tr class="sr">
        <td class="dc lbl">एकूण</td>
        <td class="num"><b>${Number(morningLiters).toFixed(1)}</b></td><td></td>${hasSnf ? '<td></td>' : ''}<td></td><td class="num"><b>रु.${n(morningAmount)}</b></td>
        <td class="num"><b>${Number(eveningLiters).toFixed(1)}</b></td><td></td>${hasSnf ? '<td></td>' : ''}<td></td><td class="num"><b>रु.${n(eveningAmount)}</b></td>
      </tr>
      <tr class="tr2">
        <td colspan="${sessionColspan}" class="lbl">
          एकूण दूध: <b>${Number(totalLiters).toFixed(1)}लि</b> &nbsp;|&nbsp; एकूण रक्कम: <b>रु.${n(totalAmount)}</b>
        </td>
        <td colspan="${sessionColspan + 1}" class="sav" style="padding:1px 3px">
          <div class="deduct-row">
            <span class="deduct-left">${deductLeft}</span>
            <span class="deduct-right">${deductRight}</span>
          </div>
        </td>
      </tr>
      <tr class="nr">
        <td colspan="${totalCols}"><b>निव्वळ देय रक्कम &nbsp;&nbsp;&nbsp; रु.${n(netAmount)}</b></td>
      </tr>
    </tfoot>
  </table>
</div>`;
}

// ─── Payment Register: flat item types ───────────────────────────────────────

type FlatItem =
  | { kind: 'sec-hdr'; label: string }
  | { kind: 'row';     bill: BillResponse; sr: number }
  | { kind: 'sec-tot'; bills: BillResponse[]; label: string }
  | { kind: 'grand';   allBills: BillResponse[]; cowBills: BillResponse[]; bufBills: BillResponse[] };

/**
 * Build ordered flat item list:  Cow → Buffalo → Mixed → Grand Total
 */
function buildFlatItems(bills: BillResponse[]): {
  items:   FlatItem[];
  hasCow:  boolean;
  hasBuf:  boolean;
} {
  const cowBills = bills.filter(b => (b.cowTotalLiters    ?? 0) > 0 && (b.buffaloTotalLiters ?? 0) === 0);
  const bufBills = bills.filter(b => (b.buffaloTotalLiters ?? 0) > 0 && (b.cowTotalLiters    ?? 0) === 0);
  const mixBills = bills.filter(b => (b.cowTotalLiters    ?? 0) > 0 && (b.buffaloTotalLiters ?? 0) > 0);

  const cowBillsForGrand = bills.filter(b => (b.cowTotalLiters    ?? 0) > 0);
  const bufBillsForGrand = bills.filter(b => (b.buffaloTotalLiters ?? 0) > 0);

  const hasCow = cowBillsForGrand.length > 0;
  const hasBuf = bufBillsForGrand.length > 0;

  const items: FlatItem[] = [];
  let sr = 1;

  if (cowBills.length > 0) {
    items.push({ kind: 'sec-hdr', label: '१  गाय (Cow)' });
    cowBills.forEach(b => items.push({ kind: 'row', bill: b, sr: sr++ }));
    items.push({ kind: 'sec-tot', bills: cowBills, label: 'एकूण गाय' });
  }

  if (bufBills.length > 0) {
    items.push({ kind: 'sec-hdr', label: '२  म्हैस (Buffalo)' });
    bufBills.forEach(b => items.push({ kind: 'row', bill: b, sr: sr++ }));
    items.push({ kind: 'sec-tot', bills: bufBills, label: 'एकूण म्हैस' });
  }

  if (mixBills.length > 0) {
    items.push({ kind: 'sec-hdr', label: '३  गाय & म्हैस (Mixed)' });
    mixBills.forEach(b => items.push({ kind: 'row', bill: b, sr: sr++ }));
    items.push({ kind: 'sec-tot', bills: mixBills, label: 'एकूण गाय & म्हैस' });
  }

  items.push({ kind: 'grand', allBills: bills, cowBills: cowBillsForGrand, bufBills: bufBillsForGrand });

  return { items, hasCow, hasBuf };
}

// Reduced row padding → ~28px/row at 15px font; usable height ~985px → ~35 rows.
// Use 20 to be safe and allow 2 extra farmers per page vs before.
const ROWS_PER_PAGE = 20;

function itemSlots(item: FlatItem, hasCow: boolean, hasBuf: boolean): number {
  if (item.kind === 'grand') {
    return (hasCow ? 1 : 0) + (hasBuf ? 1 : 0) + 1;
  }
  return 1;
}

function paginateItems(
  items:  FlatItem[],
  hasCow: boolean,
  hasBuf: boolean,
): FlatItem[][] {
  const pages: FlatItem[][] = [];
  let current: FlatItem[] = [];
  let used = 0;

  for (const item of items) {
    const cost = itemSlots(item, hasCow, hasBuf);

    if (used + cost > ROWS_PER_PAGE && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }

    current.push(item);
    used += cost;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

// ─── render flat items → HTML table rows ─────────────────────────────────────

function renderItems(items: FlatItem[]): string {
  return items.map(item => {
    if (item.kind === 'sec-hdr') {
      return `<tr class="rsec"><td colspan="7">${item.label}</td></tr>`;
    }

    if (item.kind === 'row') {
      const b = item.bill;
      const deductParts: string[] = [];
      if ((b.savingDeduction  ?? 0) > 0) deductParts.push((b.savingDeduction  ?? 0).toFixed(2));
      if ((b.advanceDeduction ?? 0) > 0) deductParts.push((b.advanceDeduction ?? 0).toFixed(2));
      if ((b.otherDeductions  ?? 0) > 0) deductParts.push((b.otherDeductions  ?? 0).toFixed(2));
      const nameDisplay = b.farmerVillage
        ? `${b.farmerName} (${b.farmerVillage})`
        : b.farmerName;
      return `
      <tr>
        <td class="rc">${b.farmerNumber}</td>
        <td class="rn" style="overflow:visible;white-space:nowrap">${nameDisplay}</td>
        <td class="rr">${(b.totalLiters ?? 0).toFixed(1)}</td>
        <td class="rr">${(b.totalAmount ?? 0).toFixed(2)}</td>
        <td class="rr rs">${deductParts.join(' + ') || '-'}</td>
        <td class="rr rnet">${(b.netAmount ?? 0).toFixed(2)}</td>
        <td class="rsign" style="text-align:center;vertical-align:bottom;padding-bottom:4px !important">
          <span style="display:inline-block;width:85px;border-bottom:1px solid #000;">&nbsp;</span>
        </td>
      </tr>`;
    }

    if (item.kind === 'sec-tot') {
      const tl = item.bills.reduce((a, b) => a + (b.totalLiters     ?? 0), 0);
      const ta = item.bills.reduce((a, b) => a + (b.totalAmount     ?? 0), 0);
      const ts = item.bills.reduce((a, b) => a + (b.savingDeduction ?? 0) + (b.advanceDeduction ?? 0) + (b.otherDeductions ?? 0), 0);
      const tn = item.bills.reduce((a, b) => a + (b.netAmount       ?? 0), 0);
      return `
      <tr class="rtot">
        <td colspan="2" class="rn">${item.label} &nbsp;(${item.bills.length} उत्पादक)</td>
        <td class="rr">${tl.toFixed(1)}</td>
        <td class="rr">${ta.toFixed(2)}</td>
        <td class="rr rs">${ts.toFixed(2)}</td>
        <td class="rr rnet">${tn.toFixed(2)}</td>
        <td></td>
      </tr>`;
    }

    if (item.kind === 'grand') {
      const { allBills, cowBills, bufBills } = item;

      const grandCowL = cowBills.reduce((a, b) => a + (b.cowTotalLiters    ?? 0), 0);
      const grandCowA = cowBills.reduce((a, b) => a + (b.cowTotalAmount    ?? 0), 0);
      const grandBufL = bufBills.reduce((a, b) => a + (b.buffaloTotalLiters ?? 0), 0);
      const grandBufA = bufBills.reduce((a, b) => a + (b.buffaloTotalAmount ?? 0), 0);
      const grandL    = allBills.reduce((a, b) => a + (b.totalLiters     ?? 0), 0);
      const grandA    = allBills.reduce((a, b) => a + (b.totalAmount     ?? 0), 0);
      const grandS    = allBills.reduce((a, b) => a + (b.savingDeduction ?? 0) + (b.advanceDeduction ?? 0) + (b.otherDeductions ?? 0), 0);
      const grandN    = allBills.reduce((a, b) => a + (b.netAmount       ?? 0), 0);

      let rows = '';
      if (grandCowL > 0) {
        rows += `
        <tr class="rcow">
          <td colspan="2" class="rn">एकूण गाय दूध (सर्व उत्पादक)</td>
          <td class="rr">${grandCowL.toFixed(1)}</td>
          <td class="rr">${grandCowA.toFixed(2)}</td>
          <td class="rr">—</td>
          <td class="rr">—</td>
          <td></td>
        </tr>`;
      }
      if (grandBufL > 0) {
        rows += `
        <tr class="rbuf">
          <td colspan="2" class="rn">एकूण म्हैस दूध (सर्व उत्पादक)</td>
          <td class="rr">${grandBufL.toFixed(1)}</td>
          <td class="rr">${grandBufA.toFixed(2)}</td>
          <td class="rr">—</td>
          <td class="rr">—</td>
          <td></td>
        </tr>`;
      }
      rows += `
      <tr class="rgrand">
        <td colspan="2" style="text-align:left;padding-left:8px;font-weight:bold">
          एकूण सर्व &nbsp;(${allBills.length} उत्पादक)
        </td>
        <td class="rr">${grandL.toFixed(1)}</td>
        <td class="rr">${grandA.toFixed(2)}</td>
        <td class="rr rs">${grandS.toFixed(2)}</td>
        <td class="rr rnet">${grandN.toFixed(2)}</td>
        <td></td>
      </tr>`;

      return rows;
    }

    return '';
  }).join('');
}

// ─── build one register page HTML ────────────────────────────────────────────

function buildPaymentRegisterPage(
  items:        FlatItem[],
  periodLabel:  string,
  pageNum:      number,
  totalPages:   number,
  totalFarmers: number,
): string {
  const todayFmt   = format(new Date(), 'dd/MM/yyyy');
  const tableRows  = renderItems(items);

  return `
<div style="padding:6px 8px;width:774px;font-family:'Noto Sans Devanagari',sans-serif;color:#000">
  <div style="text-align:center;margin-bottom:5px;border-bottom:2px solid #000;padding-bottom:5px">
    <div style="font-size:22px !important;font-weight:bold;line-height:1.4 !important">
      शिवशक्ती महिला सह. दूध संस्था, सावर्डे नं. 2
    </div>
    <div style="font-size:19px !important;font-weight:bold;margin-top:3px;line-height:1.4 !important">
      पेमेंट रजिस्टर &nbsp;|&nbsp; कालावधी: ${periodLabel}
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:15px !important;margin-bottom:4px;line-height:1.4 !important">
    <span>तारीख: ${todayFmt} &nbsp;&nbsp; एकूण उत्पादक: ${totalFarmers}</span>
    <span>पान &nbsp;${pageNum} / ${totalPages}</span>
  </div>
  <table class="rt">
    <thead>
      <tr class="rh">
        <th style="width:55px">कोड</th>
        <th style="width:240px">उत्पादकाचे नाव</th>
        <th style="width:72px">लिटर</th>
        <th style="width:92px">एकूण बिल</th>
        <th style="width:92px">कपात</th>
        <th style="width:105px">निव्वळ आदा</th>
        <th style="width:105px">सही</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</div>`;
}

// ─── core renderer ────────────────────────────────────────────────────────────

async function htmlPagesToPdf(pages: string[], fileName: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;

  const A4_W_MM    = 210;
  const A4_H_MM    = 297;
  const RENDER_SCALE = 2;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;height:1123px;background:#fff;z-index:-9999;overflow:hidden;';
  document.body.appendChild(host);

  const fontLink = document.createElement('link');
  fontLink.rel  = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap';
  document.head.appendChild(fontLink);

  await new Promise<void>(resolve => {
    const check = () => {
      if (document.fonts.check('400 12px "Noto Sans Devanagari"') &&
          document.fonts.check('700 12px "Noto Sans Devanagari"')) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    document.fonts.load('400 12px "Noto Sans Devanagari"').then(check);
    document.fonts.load('700 12px "Noto Sans Devanagari"').then(check);
    setTimeout(resolve, 3000);
  });

  try {
    for (let i = 0; i < pages.length; i++) {
      host.innerHTML = `<style>${PAGE_CSS}</style><div class="page">${pages[i]}</div>`;

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 200));

      const pageEl = host.querySelector('.page') as HTMLElement;

      const canvas = await html2canvas(pageEl, {
        scale:           RENDER_SCALE,
        useCORS:         true,
        allowTaint:      true,
        logging:         false,
        backgroundColor: '#ffffff',
        width:           794,
        height:          1123,
        windowWidth:     794,
        windowHeight:    1123,
        onclone: (clonedDoc) => {
          const link = clonedDoc.createElement('link');
          link.rel  = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap';
          clonedDoc.head.insertBefore(link, clonedDoc.head.firstChild);

          const style = clonedDoc.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              font-family: 'Noto Sans Devanagari', 'Mangal', Arial, sans-serif !important;
              line-height: 1.4 !important;
              -webkit-text-size-adjust: none !important;
            }
            td, th { overflow: visible !important; padding-top: 4px !important; }
            .rt th  { background: #fff !important; color: #000 !important; }
            .rgrand td { background: #fff !important; color: #000 !important; }
            .deduct-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              width: 100% !important;
              gap: 6px !important;
            }
            .deduct-left  { text-align: left  !important; white-space: nowrap !important; }
            .deduct-right { text-align: right !important; white-space: nowrap !important; font-weight: bold !important; }
            /* Ensure first bill card has no top space */
            .bc:first-child {
              padding-top: 0px !important;
              margin-top: 0px !important;
            }
          `;
          clonedDoc.head.appendChild(style);

          const pg = clonedDoc.querySelector('.page') as HTMLElement;
          if (pg) {
            pg.style.width    = '794px';
            pg.style.height   = '1123px';
            pg.style.overflow = 'hidden';
          }
        },
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, A4_H_MM);
    }
  } finally {
    document.body.removeChild(host);
    document.head.removeChild(fontLink);
  }

  doc.save(fileName);
}

// ─── Public: Bills PDF ───────────────────────────────────────────────────────

export async function generateBillsPDF(
bills: BillResponse[], farmerEntries: Record<number, MilkEntryResponse[]>, periodLabel: string, lm: Record<number, LedgerResponse>,
): Promise<void> {
  if (!bills.length) return;

  const pages: string[] = [];
  for (let i = 0; i < bills.length; i += 3) {
    const chunk = bills.slice(i, i + 3);
    pages.push(
      chunk.map(b => buildBillHtml(b, farmerEntries[b.farmerNumber] || b.entries || [])).join('')
    );
  }

  await htmlPagesToPdf(
    pages,
    `bills_${periodLabel.replace(/\//g, '-').replace(/\s/g, '_')}.pdf`,
  );
}

// ─── Public: Payment Register PDF (dynamic multi-page) ───────────────────────

export async function generatePaymentRegisterPDF(
bills: BillResponse[], periodLabel: string, lm: Record<number, LedgerResponse>,
): Promise<void> {
  if (!bills.length) return;

  const { items, hasCow, hasBuf } = buildFlatItems(bills);
  const pages = paginateItems(items, hasCow, hasBuf);

  const htmlPages = pages.map((pageItems, idx) =>
    buildPaymentRegisterPage(
      pageItems,
      periodLabel,
      idx + 1,
      pages.length,
      bills.length,
    )
  );

  const safeLabel = periodLabel.replace(/\//g, '-').replace(/\s/g, '_');
  await htmlPagesToPdf(htmlPages, `payment_register_${safeLabel}.pdf`);
}