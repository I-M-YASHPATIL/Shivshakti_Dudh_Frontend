import jsPDF from 'jspdf';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import type { BillResponse, MilkEntryResponse, LedgerResponse } from '../types/dairyTypes';

// ─── constants ────────────────────────────────────────────────────────────────

const SADILVAR_AMOUNT = 5;

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

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

const n0 = (v: number | undefined | null): string => Math.round(v ?? 0).toString();

const nTrunc = (v: number | undefined | null): string =>
  Math.trunc(v ?? 0).toString();

/** A bill that carries both cow and buffalo milk. */
function isMixedBill(bill: BillResponse): boolean {
  return (bill.cowTotalLiters ?? 0) > 0 && (bill.buffaloTotalLiters ?? 0) > 0;
}

/** सादिलवार — always ₹5 per bill card. */
function sadilvarOf(_bill: BillResponse): number {
  return SADILVAR_AMOUNT;
}

/** Every deduction that applies to a (single) bill — सादिलवार included. */
function totalDeductions(bill: BillResponse): number {
  return round2(
    (bill.savingDeduction  ?? 0) +
    sadilvarOf(bill) +
    (bill.advanceDeduction ?? 0) +
    (bill.otherDeductions  ?? 0),
  );
}

function computeNetAmount(bill: BillResponse): number {
  return round2((bill.totalAmount ?? 0) - totalDeductions(bill));
}

/** Morning / evening totals derived from the entries. */
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

function computeLedgerSummary(
  ledger: LedgerResponse | undefined,
  fromDate: string,
  toDate: string,
): { magilBaki: number; uchal: number; lagavad: number; jama: number; baki: number } {
  if (!ledger || !ledger.entries?.length) {
    return { magilBaki: 0, uchal: 0, lagavad: 0, jama: 0, baki: 0 };
  }

  const beforePeriod = ledger.entries.filter(e => e.entryDate < fromDate);
  const magilBaki = beforePeriod.length ? beforePeriod[beforePeriod.length - 1].balanceAfter : 0;

  const inRange = ledger.entries.filter(e => e.entryDate >= fromDate && e.entryDate <= toDate);
  const uchal   = inRange.filter(e => e.type === 'UCHAL').reduce((s, e) => s + (e.amount ?? 0), 0);
  const lagavad = inRange.filter(e => e.type === 'LAGAVAD').reduce((s, e) => s + (e.amount ?? 0), 0);
  const jama    = inRange.filter(e => e.type === 'JAMA').reduce((s, e) => s + (e.amount ?? 0), 0);

  const upToDate = ledger.entries.filter(e => e.entryDate <= toDate);
  const baki = upToDate.length ? upToDate[upToDate.length - 1].balanceAfter : 0;

  return { magilBaki, uchal, lagavad, jama, baki };
}

function sectionJamaForBill(
  bill:   BillResponse,
  type:   'COW' | 'BUFFALO',
  ledger?: LedgerResponse,
): number {
  if (!ledger || !ledger.entries?.length) return 0;

  const inRange = ledger.entries.filter(
    e => e.type === 'JAMA' && e.entryDate >= bill.fromDate && e.entryDate <= bill.toDate,
  );
  if (!inRange.length) return 0;

  if (!isMixedBill(bill)) {
    return round2(inRange.reduce((s, e) => s + (e.amount ?? 0), 0));
  }

  const totalAmount = bill.totalAmount ?? 0;
  const typeAmount  = type === 'COW' ? (bill.cowTotalAmount ?? 0) : (bill.buffaloTotalAmount ?? 0);
  const ratio       = totalAmount > 0 ? typeAmount / totalAmount : 0;

  let total = 0;
  for (const e of inRange) {
    const amt = e.amount ?? 0;
    if (e.milkType === type) {
      total += amt;
    } else if (!e.milkType || e.milkType === 'BOTH') {
      total += amt * ratio;
    }
  }
  return round2(total);
}

// ─── expand a mixed bill into two separate single-type bills ─────────────────

interface MixedSummary {
  totalNetBill: number;
  totalNetDene: number;
}

interface RenderBill {
  bill: BillResponse;
  entries: MilkEntryResponse[];
  showLedger: boolean;
  sectionType: 'COW' | 'BUFFALO' | null;
  sourceBill: BillResponse;
  mixedSummary?: MixedSummary;
}

function expandMixedToRenderBills(
  bill: BillResponse,
  entries: MilkEntryResponse[],
): RenderBill[] {
  if (!isMixedBill(bill)) {
    return [{ bill, entries, showLedger: true, sectionType: null, sourceBill: bill }];
  }

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
    { bill: cowBill, entries: cowEntries, showLedger: false, sectionType: 'COW',     sourceBill: bill },
    { bill: bufBill, entries: bufEntries, showLedger: true,  sectionType: 'BUFFALO', sourceBill: bill },
  ];
}

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
    --rs: 1;
    width: 794px;
    height: 1123px;
    padding: 4px 8px 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 0px;
    background: #fff;
    overflow: hidden;
  }

  .bc {
    border: none;
    padding: 0px 6px 3px 6px;
    flex-shrink: 0;
    margin-bottom: 0px;
    margin-top: 0px;
  }
  .bc + .bc {
    border-top: 2px solid #000 !important;
    padding-top: 3px !important;
    margin-top: 2px !important;
  }
  .bc:first-child {
    padding-top: 0px !important;
    margin-top: 0px !important;
  }
  .btitle {
    font-size: 15px !important;
    font-weight: bold;
    color: #000;
    text-align: center;
    margin-bottom: 0px;
  }
  .bm {
    display: flex;
    justify-content: space-between;
    font-size: 13px !important;
    color: #000;
    margin-top: 0px;
  }
  .bh {
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 1px 0 1px 0;
    margin-bottom: 1px;
  }
  .bat {
    text-align: center;
    font-size: 12px !important;
    font-weight: bold;
    color: #000;
    padding: 0px 4px;
    margin: 0px 0;
  }
  .bt2 { width: 100%; border-collapse: collapse; table-layout: fixed; }

  .bt2 th {
    border: none !important;
    padding: calc(0px * var(--rs, 1)) 3px calc(1px * var(--rs, 1)) 3px !important;
    text-align: right;
    white-space: nowrap;
    overflow: visible;
    font-size: calc(12px * var(--rs, 1)) !important;
    background: #fff;
    color: #000;
  }
  .bt2 td {
    border: none !important;
    padding: calc(1px * var(--rs, 1)) 3px !important;
    text-align: right;
    white-space: nowrap;
    overflow: visible;
    font-size: calc(12px * var(--rs, 1)) !important;
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

  .tr2 td {
    background: #fff !important;
    padding: calc(2px * var(--rs, 1)) 3px !important;
    font-size: calc(12px * var(--rs, 1)) !important;
  }
  .lr  td {
    background: #fff !important;
    color: #000 !important;
    font-size: calc(12.5px * var(--rs, 1)) !important;
    padding: 1px 3px !important;
    border-top: 0.5px dashed #666 !important;
    text-align: left !important;
    white-space: nowrap !important;
  }
  .nr td  {
    background: #fff !important;
    color: #000 !important;
    font-weight: bold !important;
    font-size: calc(14px * var(--rs, 1)) !important;
    text-align: center !important;
    padding: calc(2px * var(--rs, 1)) 3px calc(1px * var(--rs, 1)) 3px !important;
    border: none !important;
  }
  .mr td  {
    background: #fff !important;
    color: #000 !important;
    font-weight: bold !important;
    font-size: calc(13.5px * var(--rs, 1)) !important;
    text-align: center !important;
    padding: calc(3px * var(--rs, 1)) 3px calc(2px * var(--rs, 1)) 3px !important;
    border-top: 1px dashed #000 !important;
  }
  .lbl  { text-align: left !important; }
  .sav  { color: #000; }
  .empty{ text-align: center !important; color: #aaa; }
  .num  { font-size: calc(13px * var(--rs, 1)) !important; font-weight: 600; }
  .deduct-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 10px;
  }
  .deduct-left  { text-align: left;  white-space: nowrap; }
  .deduct-right { text-align: right; white-space: nowrap; font-weight: bold; }

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
  .rdene { font-weight: bold; color: #b00000; }

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

function buildDayRows(
  entries: MilkEntryResponse[],
  from: string,
  to: string,
  hasSnf: boolean,
  sessionColspan: number,
): string {
  const grouped = groupByDate(entries, from, to);
  return grouped.map(({ date, morning, evening }) => {
    const d = format(parseISO(date), 'dd/MM/yy');
    const mCells = morning
      ? `<td class="num">${Number(morning.liters).toFixed(1)}</td><td class="num">${Number(morning.fat).toFixed(1)}</td>${hasSnf ? `<td class="num">${morning.snf != null ? Number(morning.snf).toFixed(1) : '-'}</td>` : ''}<td class="num">${Number(morning.ratePerLiter ?? 0).toFixed(1)}</td><td class="num">${n(morning.amount)}</td>`
      : `<td colspan="${sessionColspan}" style="text-align:center;color:#aaa">-</td>`;
    const eCells = evening
      ? `<td class="num">${Number(evening.liters).toFixed(1)}</td><td class="num">${Number(evening.fat).toFixed(1)}</td>${hasSnf ? `<td class="num">${evening.snf != null ? Number(evening.snf).toFixed(1) : '-'}</td>` : ''}<td class="num">${Number(evening.ratePerLiter ?? 0).toFixed(1)}</td><td class="num">${n(evening.amount)}</td>`
      : `<td colspan="${sessionColspan}" style="text-align:center;color:#aaa">-</td>`;
    return `<tr><td class="dc">${d}</td>${mCells}${eCells}</tr>`;
  }).join('');
}

// ─── bill card HTML ──────────────────────────────────────────────────────────

function buildBillHtml(
  bill:         BillResponse,
  entries:      MilkEntryResponse[],
  ledger?:      LedgerResponse,
  showLedgerRow = true,
  sectionType:  'COW' | 'BUFFALO' | null = null,
  sourceBill?:  BillResponse,
  mixedSummary?: MixedSummary,
): string {
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
  const bufLiters        = bill.buffaloTotalLiters ?? 0;

  const jamaForCard = ledger
    ? (sectionType && sourceBill
        ? sectionJamaForBill(sourceBill, sectionType, ledger)
        : sectionJamaForBill(bill, 'COW', ledger))
    : 0;

  const netDene = round2(netAmount - jamaForCard);

  const savingPct = savingDeduction > 0 && totalAmount > 0
    ? Math.round((savingDeduction / totalAmount) * 100) : 3;

  const animalLabel =
    cowLiters > 0 && bufLiters > 0 ? 'गाय & म्हैस'
    : cowLiters > 0 ? 'गाय (Cow)'
    : bufLiters > 0 ? 'म्हैस (Buffalo)'
    : '';

  const fromFmt = format(parseISO(bill.fromDate), 'dd/MM/yy');
  const toFmt   = format(parseISO(bill.toDate),   'dd/MM/yy');

  const hasSnf = entries.some(e => e.snf != null);
  const sessionColspan = hasSnf ? 5 : 4;
  const totalCols      = hasSnf ? 11 : 9;

  const SEP = '&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;';

  const rows = buildDayRows(entries, bill.fromDate, bill.toDate, hasSnf, sessionColspan);

  const deductLeft = `(-) $ बचत कपात: <b>-रु.${n(savingDeduction)}</b>`
    + (advanceDeduction > 0 ? `${SEP}(-) आगाऊ: <b>-रु.${n(advanceDeduction)}</b>` : '')
    + (otherDeductions  > 0 ? `${SEP}(-) इतर: <b>-रु.${n(otherDeductions)}</b>`   : '');

  const deductRight = `(-) सादिलवार: <b>-रु.${n(sadilvar)}</b>`;

  const ledgerSummary = (ledger && showLedgerRow)
    ? computeLedgerSummary(ledger, bill.fromDate, bill.toDate)
    : null;

  const ledgerRow = ledgerSummary ? `
      <tr class="lr">
        <td colspan="${totalCols}">
          मागील बाकी: <b>रु.${n(ledgerSummary.magilBaki)}</b>${SEP}उचल: <b>रु.${n(ledgerSummary.uchal)}</b>${SEP}लागवड: <b>रु.${n(ledgerSummary.lagavad)}</b>${SEP}जमा: <b>रु.${n(ledgerSummary.jama)}</b>${SEP}बाकी: <b>रु.${n(ledgerSummary.baki)}</b>
        </td>
      </tr>` : '';

  const mixedRow = mixedSummary ? `
      <tr class="mr">
        <td colspan="${totalCols}">
          एकूण निव्वळ बिल (गाय + म्हैस) &nbsp;&nbsp; रु.${n(mixedSummary.totalNetBill)}${SEP}एकूण निव्वळ देणे &nbsp;&nbsp; रु.${nTrunc(mixedSummary.totalNetDene)}
        </td>
      </tr>` : '';

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
          एकूण दूध: <b>${Number(totalLiters).toFixed(1)}लि</b>${SEP}एकूण रक्कम: <b>रु.${n(totalAmount)}</b>
        </td>
        <td colspan="${sessionColspan + 1}" class="sav" style="padding:2px 3px">
          <div class="deduct-row">
            <span class="deduct-left">${deductLeft}</span>
            <span class="deduct-right">${deductRight}</span>
          </div>
        </td>
      </tr>
      <tr class="nr">
        <td colspan="${totalCols}">
          <b>निव्वळ बिल &nbsp;&nbsp; रु.${n(netAmount)}${SEP}निव्वळ देणे &nbsp;&nbsp; रु.${nTrunc(netDene)}</b>
        </td>
      </tr>${ledgerRow}${mixedRow}
    </tfoot>
  </table>
</div>`;
}

// ─── Payment Register ────────────────────────────────────────────────────────

function billShareForSection(
  bill:   BillResponse,
  type:   'COW' | 'BUFFALO',
  ledger?: LedgerResponse,
) {
  const jama = sectionJamaForBill(bill, type, ledger);

  if (isMixedBill(bill)) {
    const totalAmount = bill.totalAmount ?? 0;
    const amount = type === 'COW' ? (bill.cowTotalAmount ?? 0) : (bill.buffaloTotalAmount ?? 0);
    const ratio  = totalAmount > 0 ? amount / totalAmount : 0;
    const liters = type === 'COW' ? (bill.cowTotalLiters ?? 0) : (bill.buffaloTotalLiters ?? 0);

    const saving  = round2((bill.savingDeduction  ?? 0) * ratio);
    const advance = round2((bill.advanceDeduction ?? 0) * ratio);
    const other   = round2((bill.otherDeductions  ?? 0) * ratio);

    const deduct  = round2(saving + advance + other);
    const net     = round2(amount - deduct - SADILVAR_AMOUNT);

    const dene = round2(net - jama);

    return { liters, amount, deduct, net, saving, advance, other, jama, dene };
  }

  const saving  = bill.savingDeduction  ?? 0;
  const advance = bill.advanceDeduction ?? 0;
  const other   = bill.otherDeductions  ?? 0;

  const deduct  = round2(saving + advance + other);
  const net     = round2((bill.totalAmount ?? 0) - deduct - SADILVAR_AMOUNT);

  const dene = round2(net - jama);

  return {
    liters: bill.totalLiters ?? 0,
    amount: bill.totalAmount ?? 0,
    deduct,
    net,
    saving,
    advance,
    other,
    jama,
    dene,
  };
}


type FlatItem =
  | { kind: 'sec-hdr'; label: string }
  | { kind: 'row';     bill: BillResponse; sr: number; sectionType: 'COW' | 'BUFFALO' }
  | { kind: 'sec-tot'; bills: BillResponse[]; label: string; sectionType: 'COW' | 'BUFFALO' }
  | { kind: 'grand';   allBills: BillResponse[]; cowBills: BillResponse[]; bufBills: BillResponse[] };

function buildFlatItems(bills: BillResponse[]): {
  items:   FlatItem[];
  hasCow:  boolean;
  hasBuf:  boolean;
} {
  const cowBillsForGrand = bills.filter(b => (b.cowTotalLiters    ?? 0) > 0);
  const bufBillsForGrand = bills.filter(b => (b.buffaloTotalLiters ?? 0) > 0);

  const hasCow = cowBillsForGrand.length > 0;
  const hasBuf = bufBillsForGrand.length > 0;

  const items: FlatItem[] = [];
  let sr = 1;

  if (cowBillsForGrand.length > 0) {
    items.push({ kind: 'sec-hdr', label: '१  गाय (Cow)' });
    cowBillsForGrand.forEach(b => items.push({ kind: 'row', bill: b, sr: sr++, sectionType: 'COW' }));
    items.push({ kind: 'sec-tot', bills: cowBillsForGrand, label: 'एकूण गाय', sectionType: 'COW' });
  }

  if (bufBillsForGrand.length > 0) {
    items.push({ kind: 'sec-hdr', label: '२  म्हैस (Buffalo)' });
    bufBillsForGrand.forEach(b => items.push({ kind: 'row', bill: b, sr: sr++, sectionType: 'BUFFALO' }));
    items.push({ kind: 'sec-tot', bills: bufBillsForGrand, label: 'एकूण म्हैस', sectionType: 'BUFFALO' });
  }

  items.push({ kind: 'grand', allBills: bills, cowBills: cowBillsForGrand, bufBills: bufBillsForGrand });

  return { items, hasCow, hasBuf };
}

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

function renderItems(
  items:         FlatItem[],
  farmerLedgers: Record<number, LedgerResponse>,
): string {
  return items.map(item => {
    if (item.kind === 'sec-hdr') {
      return `<tr class="rsec"><td colspan="9">${item.label}</td></tr>`;
    }

     if (item.kind === 'row') {
      const b      = item.bill;
      const mixed  = isMixedBill(b);
      const ledger = farmerLedgers[b.farmerNumber];
      const share  = billShareForSection(b, item.sectionType, ledger);

      let deductLabel: string;
      if (mixed) {
        deductLabel = share.deduct > 0 ? share.deduct.toFixed(2) : '-';
      } else {
        const parts: string[] = [];
        if (share.saving  > 0) parts.push(share.saving.toFixed(2));
        if (share.advance > 0) parts.push(share.advance.toFixed(2));
        if (share.other   > 0) parts.push(share.other.toFixed(2));
        deductLabel = parts.join(' + ') || '-';
      }

      const nameDisplay = b.farmerVillage
        ? `${b.farmerName} (${b.farmerVillage})`
        : b.farmerName;
      return `
      <tr>
        <td class="rc">${b.farmerNumber}</td>
        <td class="rn" style="overflow:visible;white-space:nowrap">${nameDisplay}</td>
        <td class="rr">${share.liters.toFixed(1)}</td>
        <td class="rr">${share.amount.toFixed(2)}</td>
        <td class="rr rs">${deductLabel}</td>
        <td class="rr rnet">${share.net.toFixed(2)}</td>
        <td class="rr">${share.jama > 0 ? n0(share.jama) : '-'}</td>
        <td class="rr rdene">${nTrunc(share.dene)}</td>
        <td class="rsign" style="text-align:center;vertical-align:bottom;padding-bottom:4px !important">
          <span style="display:inline-block;width:60px;border-bottom:1px solid #000;">&nbsp;</span>
        </td>
      </tr>`;
    }

    if (item.kind === 'sec-tot') {
      const contributions = item.bills.map(b =>
        billShareForSection(b, item.sectionType, farmerLedgers[b.farmerNumber]),
      );
      const tl = contributions.reduce((a, c) => a + c.liters, 0);
      const ta = contributions.reduce((a, c) => a + c.amount, 0);
      const ts = contributions.reduce((a, c) => a + c.deduct, 0);
      const tn = contributions.reduce((a, c) => a + c.net,    0);
      const tj = contributions.reduce((a, c) => a + c.jama,   0);
      const td = contributions.reduce((a, c) => a + c.dene,   0);
      return `
      <tr class="rtot">
        <td colspan="2" class="rn">${item.label} &nbsp;(${item.bills.length} उत्पादक)</td>
        <td class="rr">${tl.toFixed(1)}</td>
        <td class="rr">${ta.toFixed(2)}</td>
        <td class="rr rs">${ts.toFixed(2)}</td>
        <td class="rr rnet">${tn.toFixed(2)}</td>
        <td class="rr">${n0(tj)}</td>
        <td class="rr rdene">${nTrunc(td)}</td>
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

      let grandS = 0;
      let grandN = 0;
      let grandJ = 0;
      let grandD = 0;
      for (const b of allBills) {
        const ledger = farmerLedgers[b.farmerNumber];
        if (isMixedBill(b)) {
          const cow = billShareForSection(b, 'COW', ledger);
          const buf = billShareForSection(b, 'BUFFALO', ledger);
          grandS += cow.deduct + buf.deduct;
          grandN += cow.net    + buf.net;
          grandJ += cow.jama   + buf.jama;
          grandD += cow.dene   + buf.dene;
        } else {
          const net   = computeNetAmount(b);
          const jama  = sectionJamaForBill(b, 'COW', ledger);
          grandS += totalDeductions(b);
          grandN += net;
          grandJ += jama;
          grandD += round2(net - jama);
        }
      }
      grandS = round2(grandS);
      grandN = round2(grandN);
      grandJ = round2(grandJ);
      grandD = round2(grandD);

      let rows = '';
      if (grandCowL > 0) {
        rows += `
        <tr class="rcow">
          <td colspan="2" class="rn">एकूण गाय दूध (सर्व उत्पादक)</td>
          <td class="rr">${grandCowL.toFixed(1)}</td>
          <td class="rr">${grandCowA.toFixed(2)}</td>
          <td class="rr">—</td>
          <td class="rr">—</td>
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
        <td class="rr">${grandJ.toFixed(2)}</td>
        <td class="rr rdene">${nTrunc(grandD)}</td>
        <td></td>
      </tr>`;

      return rows;
    }

    return '';
  }).join('');
}

function buildPaymentRegisterPage(
  items:         FlatItem[],
  periodLabel:   string,
  pageNum:       number,
  totalPages:    number,
  totalFarmers:  number,
  farmerLedgers: Record<number, LedgerResponse>,
): string {
  const todayFmt   = format(new Date(), 'dd/MM/yyyy');
  const tableRows  = renderItems(items, farmerLedgers);

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
        <th style="width:42px">कोड</th>
        <th style="width:175px">उत्पादकाचे नाव</th>
        <th style="width:58px">लिटर</th>
        <th style="width:78px">एकूण बिल</th>
        <th style="width:72px">कपात</th>
        <th style="width:85px">निव्वळ आदा</th>
        <th style="width:70px">जमा</th>
        <th style="width:70px">देणे</th>
        <th style="width:70px">सही</th>
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
            .rt td, .rt th { overflow: visible !important; padding-top: 4px !important; }
            .rt th  { background: #fff !important; color: #000 !important; }
            .rgrand td { background: #fff !important; color: #000 !important; }
            .deduct-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              width: 100% !important;
              gap: 10px !important;
            }
            .deduct-left  { text-align: left  !important; white-space: nowrap !important; }
            .deduct-right { text-align: right !important; white-space: nowrap !important; font-weight: bold !important; }
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

const BILLS_PER_PAGE = 3;
const PAGE_INNER_HEIGHT = 1095;

function chunkRenderBillsForPages(renderBills: RenderBill[]): RenderBill[][] {
  const pages: RenderBill[][] = [];
  let current: RenderBill[] = [];

  for (const rb of renderBills) {
    if (current.length >= BILLS_PER_PAGE) {
      pages.push(current);
      current = [];
    }
    current.push(rb);
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

function countBillRows(bill: BillResponse): number {
  try {
    const days = eachDayOfInterval({
      start: parseISO(bill.fromDate),
      end:   parseISO(bill.toDate),
    }).length;
    return Math.max(days, 1);
  } catch {
    return 31;
  }
}

function computePageRowScale(renderBills: RenderBill[]): number {
  const n = renderBills.length;
  if (!n) return 1;

  const totalRows = renderBills.reduce((sum, rb) => sum + countBillRows(rb.bill), 0);

  const FIXED_PER_BILL     = 53;
  const SEPARATOR          = 7;
  const VARIABLE_PER_BILL  = 114;
  const ROW_HEIGHT         = 19;

  const fixedTotal    = n * FIXED_PER_BILL + Math.max(0, n - 1) * SEPARATOR;
  const variableTotal = n * VARIABLE_PER_BILL + totalRows * ROW_HEIGHT;

  const budget = PAGE_INNER_HEIGHT - fixedTotal;
  if (variableTotal <= budget) return 1;

  return Math.max(budget / variableTotal, 0.65);
}

export async function generateBillsPDF(
  bills:         BillResponse[],
  farmerEntries: Record<number, MilkEntryResponse[]>,
  periodLabel:   string,
  farmerLedgers: Record<number, LedgerResponse> = {},
): Promise<void> {
  if (!bills.length) return;

  const renderBills: RenderBill[] = [];
  for (const bill of bills) {
    const entries = farmerEntries[bill.farmerNumber] || bill.entries || [];
    const expanded = expandMixedToRenderBills(bill, entries);

    if (expanded.length === 2 && isMixedBill(bill)) {
      const ledger    = farmerLedgers[bill.farmerNumber];
      const cowBill   = expanded[0].bill;
      const bufBill   = expanded[1].bill;

      const cowNet    = computeNetAmount(cowBill);
      const bufNet    = computeNetAmount(bufBill);
      const totalNetBill = round2(cowNet + bufNet);

      const jamaCow = sectionJamaForBill(bill, 'COW',     ledger);
      const jamaBuf = sectionJamaForBill(bill, 'BUFFALO', ledger);
      const totalNetDene = round2(totalNetBill - jamaCow - jamaBuf);

      expanded[1].mixedSummary = { totalNetBill, totalNetDene };
    }

    renderBills.push(...expanded);
  }

  const pages: string[] = [];
  const chunks = chunkRenderBillsForPages(renderBills);

  for (const chunk of chunks) {
    const rs = computePageRowScale(chunk);

    const content = chunk
      .map(rb =>
        buildBillHtml(
          rb.bill,
          rb.entries,
          farmerLedgers[rb.bill.farmerNumber],
          rb.showLedger,
          rb.sectionType,
          rb.sourceBill,
          rb.mixedSummary,
        ),
      )
      .join('');

    pages.push(`<style>.page{--rs:${rs.toFixed(4)};}</style>${content}`);
  }

  await htmlPagesToPdf(
    pages,
    `bills_${periodLabel.replace(/\//g, '-').replace(/\s/g, '_')}.pdf`,
  );
}

// ─── Public: Payment Register PDF ────────────────────────────────────────────

export async function generatePaymentRegisterPDF(
  bills:         BillResponse[],
  periodLabel:   string,
  farmerLedgers: Record<number, LedgerResponse> = {},
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
      farmerLedgers,
    )
  );

  const safeLabel = periodLabel.replace(/\//g, '-').replace(/\s/g, '_');
  await htmlPagesToPdf(htmlPages, `payment_register_${safeLabel}.pdf`);
}