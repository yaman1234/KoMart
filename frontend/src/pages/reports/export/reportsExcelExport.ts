import * as XLSX from 'xlsx';
import type {
  ExecutiveFinancialSummary,
  SalesPerformanceReport,
  SoldProductWithMargin,
  PurchasingPayablesReport,
  InventoryHealthReport,
  CashFlowStatement,
} from '@/types';

interface ExportReportsData {
  startDate: string;
  endDate: string;
  execSummary?: ExecutiveFinancialSummary | null;
  salesPerf?: SalesPerformanceReport | null;
  itemsSold?: SoldProductWithMargin[] | null;
  purchasing?: PurchasingPayablesReport | null;
  invHealth?: InventoryHealthReport | null;
  cashFlow?: CashFlowStatement | null;
}

function autoFitColumns(data: any[][]): { wch: number }[] {
  const colWidths: number[] = [];
  for (const row of data) {
    if (!row || !Array.isArray(row)) continue;
    row.forEach((val, colIdx) => {
      const len = val !== null && val !== undefined ? String(val).length : 0;
      // Cap banner/title row contribution if row length is small (e.g. title banners or section headers)
      const effectiveLen = row.length <= 3 ? Math.min(len, 25) : len;
      colWidths[colIdx] = Math.max(colWidths[colIdx] || 10, effectiveLen + 2);
    });
  }
  return colWidths.map((w) => ({ wch: Math.min(Math.max(w, 12), 45) }));
}

export function exportReportsWorkbook({
  startDate,
  endDate,
  execSummary,
  salesPerf,
  itemsSold,
  purchasing,
  invHealth,
  cashFlow,
}: ExportReportsData): void {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Executive Summary & P&L
  // -------------------------------------------------------------
  if (execSummary) {
    const pnl = (execSummary.pnl || {}) as any;
    const bridge = (execSummary.cashBridge || execSummary.cash_bridge || {}) as any;
    const wc = (execSummary.workingCapital || execSummary.working_capital || {}) as any;
    const tax = (execSummary.taxVat || execSummary.tax_vat || {}) as any;

    const grossSales = pnl.grossSales ?? pnl.gross_sales ?? 0;
    const totalDiscounts = pnl.totalDiscounts ?? pnl.total_discounts ?? 0;
    const netSales = pnl.netSales ?? pnl.net_sales ?? 0;
    const totalCogs = pnl.totalCogs ?? pnl.total_cogs ?? 0;
    const grossProfit = pnl.grossProfit ?? pnl.gross_profit ?? 0;
    const grossMarginPct = pnl.grossMarginPct ?? pnl.gross_margin_pct ?? 0;
    const operatingExpenses = pnl.operatingExpenses ?? pnl.operating_expenses ?? 0;
    const operatingProfit = pnl.operatingProfit ?? pnl.operating_profit ?? 0;
    const operatingMarginPct = pnl.operatingMarginPct ?? pnl.operating_margin_pct ?? 0;
    const itemMarkdowns = pnl.itemMarkdowns ?? pnl.item_markdowns ?? 0;
    const billDiscounts = pnl.billDiscounts ?? pnl.bill_discounts ?? 0;

    const accrualOperatingProfit = bridge.accrualOperatingProfit ?? bridge.accrual_operating_profit ?? 0;
    const nonCashConsumption = bridge.nonCashConsumption ?? bridge.non_cash_consumption ?? 0;
    const cogsInventoryReduction = bridge.cogsInventoryReduction ?? bridge.cogs_inventory_reduction ?? 0;
    const supplierPoPayments = bridge.supplierPoPayments ?? bridge.supplier_po_payments ?? 0;
    const supplierRefundsCollected = bridge.supplierRefundsCollected ?? bridge.supplier_refunds_collected ?? 0;
    const timingFloatDifference = bridge.timingFloatDifference ?? bridge.timing_float_difference ?? 0;
    const netCashFlow = bridge.netCashFlow ?? bridge.net_cash_flow ?? 0;

    const accountsPayable = wc.accountsPayable ?? wc.accounts_payable ?? 0;
    const inventoryValue = wc.inventoryValue ?? wc.inventory_value ?? 0;

    const taxableSales = tax.taxableSales ?? tax.taxable_sales ?? 0;
    const exemptSales = tax.exemptSales ?? tax.exempt_sales ?? 0;
    const outputVat13 = tax.outputVat13 ?? tax.output_vat_13 ?? 0;
    const roundOff = tax.roundOff ?? tax.round_off ?? 0;

    const s1Data: any[][] = [
      ['KoMart Supermarket — Executive Financial Summary'],
      [`Period: ${startDate} to ${endDate}`],
      [],
      ['=== 1. TOP KEY PERFORMANCE INDICATORS ==='],
      ['Metric', 'Amount (NPR)', 'Notes'],
      ['Gross Scanned Sales', grossSales, '100% Shelf value'],
      ['Total Markdowns & Discounts', -totalDiscounts, `${grossSales > 0 ? ((totalDiscounts / grossSales) * 100).toFixed(1) : '0.0'}% markdown rate`],
      ['Net Sales Turnover', netSales, 'Actual turnover after markdowns'],
      ['Cost of Goods Sold (COGS)', -totalCogs, 'FEFO batch acquisition cost'],
      ['Gross Trading Profit', grossProfit, `Trading Margin: ${Number(grossMarginPct).toFixed(1)}%`],
      ['Operating Expenses (OpEx)', -operatingExpenses, 'Store overheads (excl. supplier bills)'],
      ['Operating Profit (EBIT)', operatingProfit, `Operating Margin: ${Number(operatingMarginPct).toFixed(1)}%`],
      ['Period Net Cash Flow', netCashFlow, 'Actual net cash delta in till & bank'],
      ['Total Accounts Payable Owed', accountsPayable, 'Unpaid balance to suppliers'],
      ['Total Inventory Valuation', inventoryValue, 'Batch cost balance sheet asset value'],
      [],
      ['=== 2. TRADING PROFIT & LOSS WATERFALL ==='],
      ['Line Item', 'Amount (NPR)', 'Waterfall Type'],
      ['Gross Sales', grossSales, 'Inflow (+)'],
      ['(-) Item Price Markdowns', -itemMarkdowns, 'Markdown (-)'],
      ['(-) Bill & Loyalty Discounts', -billDiscounts, 'Discount (-)'],
      ['(=) Net Sales Revenue', netSales, 'Subtotal'],
      ['(-) Cost of Goods Sold (FEFO)', -totalCogs, 'Direct Cost (-)'],
      ['(=) Gross Trading Profit', grossProfit, 'Gross Profit'],
      ['(-) Operating Overheads', -operatingExpenses, 'Overhead (-)'],
      ['(=) Operating Profit (EBIT)', operatingProfit, 'Operating Earnings'],
      [],
      ['=== 3. CASH-TO-PROFIT RECONCILIATION BRIDGE ==='],
      ['Bridge Component', 'Amount (NPR)', 'Explanation'],
      ['Accrual Operating Profit (P&L)', accrualOperatingProfit, 'Paper profit from accrual accounting'],
      ['(+) Non-Cash Internal Store Consumption', nonCashConsumption, 'Added back (no cash left the store)'],
      ['(+) Non-Cash COGS Expense (Stock Depletion)', cogsInventoryReduction, 'Added back (goods paid for previously)'],
      ['(-) Supplier PO Bill Payments', -supplierPoPayments, 'Cash paid to vendors in period'],
      ['(+) Supplier Return Refunds Collected', supplierRefundsCollected, 'Cash/bank refunds received from vendors'],
      ['(±) Timing & Float Differences', timingFloatDifference, 'Float adjustments and timing lags'],
      ['(=) Period Net Cash Inflow / (Outflow)', netCashFlow, 'Net change in register till and bank accounts'],
      [],
      ['=== 4. IRD TAX & VAT COMPLIANCE ==='],
      ['Item', 'Amount (NPR)'],
      ['Taxable Sales (13% VAT)', taxableSales],
      ['Exempt / Non-Taxable Sales (Basic Foods)', exemptSales],
      ['Total 13% Output VAT Collected', outputVat13],
      ['Total Paisa Round-Off Balance', roundOff],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
    ws1['!cols'] = autoFitColumns(s1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Executive P&L');
  }

  // -------------------------------------------------------------
  // Sheet 2: Sales & Product Margins
  // -------------------------------------------------------------
  if (salesPerf || itemsSold) {
    const s2Data: any[][] = [
      ['KoMart Supermarket — Sales & Merchandising Performance'],
      [`Period: ${startDate} to ${endDate}`],
      [],
      ['=== 1. DEPARTMENT & CATEGORY CONTRIBUTION ==='],
      [
        'Category',
        'Units Sold',
        'Gross Sales',
        'Discounts',
        'Net Revenue',
        'COGS',
        'Gross Profit',
        'Margin %',
        'Revenue Share %',
        'Profit Share %',
      ],
    ];

    const categoryList = salesPerf?.categories || [];
    for (const cat of categoryList) {
      const uSold = cat.unitsSold ?? cat.units_sold ?? 0;
      const gSales = cat.grossSales ?? cat.gross_sales ?? 0;
      const disc = cat.discounts ?? 0;
      const nRev = cat.netRevenue ?? cat.net_revenue ?? 0;
      const cogs = cat.cogs ?? 0;
      const gProf = cat.grossProfit ?? cat.gross_profit ?? 0;
      const gMarg = cat.grossMarginPct ?? cat.gross_margin_pct ?? 0;
      const revShare = cat.revenueSharePct ?? cat.revenue_share_pct ?? 0;
      const profShare = cat.profitSharePct ?? cat.profit_share_pct ?? 0;

      s2Data.push([
        cat.category,
        uSold,
        gSales,
        disc,
        nRev,
        cogs,
        gProf,
        Number(gMarg).toFixed(1),
        Number(revShare).toFixed(1),
        Number(profShare).toFixed(1),
      ]);
    }

    s2Data.push([]);
    s2Data.push(['=== 2. PRODUCT PROFITABILITY MATRIX (ITEMS SOLD) ===']);
    s2Data.push([
      'Product Name',
      'SKU',
      'Category',
      'UOM',
      'Quantity Sold',
      'Avg Selling Price',
      'Unit Cost',
      'Gross Sales',
      'Line Discounts',
      'Bill Discounts',
      'Total Discounts',
      'Net Revenue',
      'Total COGS',
      'Gross Profit',
      'Gross Margin %',
    ]);

    if (itemsSold) {
      for (const item of itemsSold) {
        const qSold = item.quantitySold ?? item.quantity_sold ?? 0;
        const avgPrice = item.avgSellingPrice ?? item.avg_selling_price ?? 0;
        const uCost = item.unitCost ?? item.unit_cost ?? 0;
        const gSales = item.grossSales ?? item.gross_sales ?? 0;
        const lDisc = item.lineDiscount ?? item.line_discount ?? 0;
        const bDisc = item.billDiscount ?? item.bill_discount ?? 0;
        const tDisc = item.totalDiscount ?? item.total_discount ?? 0;
        const nRev = item.netRevenue ?? item.net_revenue ?? 0;
        const tCogs = item.totalCogs ?? item.total_cogs ?? 0;
        const gProf = item.grossProfit ?? item.gross_profit ?? 0;
        const gMarg = item.grossMarginPct ?? item.gross_margin_pct ?? 0;
        const sellUom = item.sellUom ?? item.sell_uom ?? 'pcs';

        s2Data.push([
          item.name,
          item.sku || '',
          item.category || '',
          sellUom,
          qSold,
          avgPrice,
          uCost,
          gSales,
          lDisc,
          bDisc,
          tDisc,
          nRev,
          tCogs,
          gProf,
          Number(gMarg).toFixed(1),
        ]);
      }
    }

    const ws2 = XLSX.utils.aoa_to_sheet(s2Data);
    ws2['!cols'] = autoFitColumns(s2Data);
    XLSX.utils.book_append_sheet(wb, ws2, 'Sales & Margins');
  }

  // -------------------------------------------------------------
  // Sheet 3: Purchases & Payables
  // -------------------------------------------------------------
  if (purchasing) {
    const aging = (purchasing.apAging || purchasing.ap_aging || {}) as any;
    const cur30 = aging.current_0_30 ?? aging.current0To30 ?? 0;
    const age60 = aging.aging_31_60 ?? aging.aging31To60 ?? 0;
    const age90 = aging.aging_61_90 ?? aging.aging61To90 ?? 0;
    const over90 = aging.over_90 ?? aging.over90 ?? 0;
    const totalOutstandingAp = purchasing.totalOutstandingAp ?? purchasing.total_outstanding_ap ?? aging.totalAp ?? aging.total_ap ?? 0;

    const s3Data: any[][] = [
      ['KoMart Supermarket — Procurement & Accounts Payable Ledger'],
      [`Period: ${startDate} to ${endDate}`],
      [],
      ['=== 1. ACCOUNTS PAYABLE (AP) AGING SUMMARY ==='],
      ['Total Outstanding AP', totalOutstandingAp],
      ['Current (0-30 Days)', cur30],
      ['Due (31-60 Days)', age60],
      ['Overdue (61-90 Days)', age90],
      ['Critical Overdue (>90 Days)', over90],
      [],
      ['=== 2. SUPPLIER LEDGER & BALANCES ==='],
      [
        'Supplier Name',
        'PAN Number',
        'Phone',
        'PO Count',
        'Gross Purchases',
        'Discounts',
        'Freight / Charges',
        'Net Purchases',
        'Amount Paid',
        'Balance Due',
        'Current (0-30d)',
        '31-60d',
        '61-90d',
        '>90d',
      ],
    ];

    const supList = purchasing.supplierLedger || purchasing.supplier_ledger || [];
    for (const sup of supList) {
      const sAging = (sup.aging || {}) as any;
      const sCur = sAging.current_0_30 ?? sAging.current0To30 ?? 0;
      const s60 = sAging.aging_31_60 ?? sAging.aging31To60 ?? 0;
      const s90 = sAging.aging_61_90 ?? sAging.aging61To90 ?? 0;
      const sOver = sAging.over_90 ?? sAging.over90 ?? 0;

      s3Data.push([
        sup.supplierName || sup.supplier_name,
        sup.panNumber || sup.pan_number || '',
        sup.phone || '',
        sup.orderCount ?? sup.order_count ?? 0,
        sup.grossPurchases ?? sup.gross_purchases ?? 0,
        sup.discounts ?? 0,
        sup.additionalCharges ?? sup.additional_charges ?? 0,
        sup.netPurchases ?? sup.net_purchases ?? 0,
        sup.amountPaid ?? sup.amount_paid ?? 0,
        sup.outstandingBalance ?? sup.outstanding_balance ?? 0,
        sCur,
        s60,
        s90,
        sOver,
      ]);
    }

    s3Data.push([]);
    s3Data.push(['=== 3. PURCHASE RETURNS & OPEN RECEIVABLES ===']);
    s3Data.push([
      'Return #',
      'Return Date',
      'Supplier Name',
      'PO Reference',
      'Items Count',
      'Total Amount',
      'Amount Received',
      'Pending Receivable',
      'Settlement Type',
      'Status',
    ]);

    const retList = purchasing.returnsLedger || purchasing.returns_ledger || [];
    for (const ret of retList) {
      s3Data.push([
        ret.returnNumber || ret.return_number,
        ret.returnDate || ret.return_date,
        ret.supplierName || ret.supplier_name,
        ret.orderNumber || ret.order_number || '',
        ret.itemsCount ?? ret.items_count ?? 0,
        ret.totalAmount ?? ret.total_amount ?? 0,
        ret.amountReceived ?? ret.amount_received ?? 0,
        ret.pendingReceivable ?? ret.pending_receivable ?? 0,
        ret.settlementType || ret.settlement_type,
        ret.status,
      ]);
    }

    const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
    ws3['!cols'] = autoFitColumns(s3Data);
    XLSX.utils.book_append_sheet(wb, ws3, 'Purchasing & Payables');
  }

  // -------------------------------------------------------------
  // Sheet 4: Inventory Health & Reorders
  // -------------------------------------------------------------
  if (invHealth) {
    const totalSkus = invHealth.totalSkus ?? invHealth.total_skus ?? 0;
    const totalInvVal = invHealth.totalInventoryValue ?? invHealth.total_inventory_value ?? 0;
    const outOfStock = invHealth.outOfStockCount ?? invHealth.out_of_stock_count ?? 0;
    const lowStock = invHealth.lowStockCount ?? invHealth.low_stock_count ?? 0;

    const s4Data: any[][] = [
      ['KoMart Supermarket — Inventory Valuation & Reorder Center'],
      [`Report Generated Date: ${new Date().toISOString().split('T')[0]}`],
      [],
      ['=== 1. INVENTORY VALUATION SUMMARY ==='],
      ['Total Active SKUs', totalSkus],
      ['Total Batch Acquisition Valuation', totalInvVal],
      ['Out of Stock Items', outOfStock],
      ['Low Stock Items', lowStock],
      [],
      ['=== 2. CATEGORY BATCH VALUATION ==='],
      ['Category', 'SKU Count', 'Total Units', 'Batch Valuation', 'Valuation Share %'],
    ];

    const catValList = invHealth.valuationByCategory || invHealth.valuation_by_category || [];
    for (const cat of catValList) {
      const skuCount = cat.skuCount ?? cat.sku_count ?? 0;
      const totalUnits = cat.totalUnits ?? cat.total_units ?? 0;
      const batchVal = cat.batchValuation ?? cat.batch_valuation ?? 0;
      const valShare = cat.valuationSharePct ?? cat.valuation_share_pct ?? 0;

      s4Data.push([
        cat.category,
        skuCount,
        totalUnits,
        batchVal,
        Number(valShare).toFixed(1),
      ]);
    }

    s4Data.push([]);
    s4Data.push(['=== 3. ACTIONABLE REORDER LIST ===']);
    s4Data.push([
      'Product Name',
      'SKU',
      'Category',
      'Current Stock',
      'Low Stock Threshold',
      'Status',
      'Cost Price',
      'Selling Price',
      'Units Needed',
      'Est. Reorder Cost',
    ]);

    const reorderList = invHealth.reorderCandidates || invHealth.reorder_candidates || [];
    for (const r of reorderList) {
      const rStock = r.stock ?? 0;
      const rThreshold = r.lowStockThreshold ?? r.low_stock_threshold ?? 0;
      const rCost = r.costPrice ?? r.cost_price ?? 0;
      const rSell = r.sellingPrice ?? r.selling_price ?? 0;
      const rNeeded = r.unitsNeeded ?? r.units_needed ?? 0;
      const rEstCost = r.estimatedReorderCost ?? r.estimated_reorder_cost ?? 0;

      s4Data.push([
        r.name,
        r.sku,
        r.category,
        rStock,
        rThreshold,
        r.status,
        rCost,
        rSell,
        rNeeded,
        rEstCost,
      ]);
    }

    s4Data.push([]);
    s4Data.push(['=== 4. NEAR-EXPIRY BATCHES (<30 DAYS) ===']);
    s4Data.push([
      'Product Name',
      'SKU',
      'Category',
      'Batch #',
      'Quantity',
      'Unit Cost',
      'Stock Value at Risk',
      'Expiry Date',
      'Days Until Expiry',
    ]);

    const nearExpList = invHealth.nearExpiryBatches || invHealth.near_expiry_batches || [];
    for (const exp of nearExpList) {
      const expName = exp.productName || exp.product_name || '';
      const bNum = exp.batchNumber || exp.batch_number || '';
      const bQty = exp.quantity ?? 0;
      const uCost = exp.unitCost ?? exp.unit_cost ?? 0;
      const atRisk = exp.stockValueAtRisk ?? exp.stock_value_at_risk ?? 0;
      const expDate = exp.expiryDate || exp.expiry_date || '';
      const daysUntil = exp.daysUntilExpiry ?? exp.days_until_expiry ?? 0;

      s4Data.push([
        expName,
        exp.sku,
        exp.category,
        bNum,
        bQty,
        uCost,
        atRisk,
        expDate,
        daysUntil,
      ]);
    }

    s4Data.push([]);
    s4Data.push(['=== 5. DEAD STOCK (>30 DAYS NO SALES) ===']);
    s4Data.push([
      'Product Name',
      'SKU',
      'Category',
      'Stock on Hand',
      'Cost Price',
      'Capital Locked Up',
      'Days Without Sale',
    ]);

    const deadList = invHealth.deadStockItems || invHealth.dead_stock_items || [];
    for (const dead of deadList) {
      const dName = dead.productName || dead.product_name || '';
      const dStock = dead.stock ?? 0;
      const dCost = dead.costPrice ?? dead.cost_price ?? 0;
      const dVal = dead.stockValue ?? dead.stock_value ?? 0;
      const dDays = dead.daysWithoutSale ?? dead.days_without_sale ?? 0;

      s4Data.push([
        dName,
        dead.sku,
        dead.category,
        dStock,
        dCost,
        dVal,
        dDays,
      ]);
    }

    const ws4 = XLSX.utils.aoa_to_sheet(s4Data);
    ws4['!cols'] = autoFitColumns(s4Data);
    XLSX.utils.book_append_sheet(wb, ws4, 'Inventory & Reorders');
  }

  // -------------------------------------------------------------
  // Sheet 5: Cash Flow & Wallets
  // -------------------------------------------------------------
  if (cashFlow) {
    const inf = (cashFlow.inflows || {}) as any;
    const outf = (cashFlow.outflows || {}) as any;

    const salesCash = inf.salesCash ?? inf.sales_cash ?? 0;
    const salesBank = inf.salesBank ?? inf.sales_bank ?? 0;
    const salesEsewa = inf.salesEsewa ?? inf.sales_esewa ?? 0;
    const supplierRefunds = inf.supplierRefunds ?? inf.supplier_refunds ?? 0;
    const transfersIn = inf.transfersIn ?? inf.transfers_in ?? 0;
    const adjustmentsIn = inf.adjustmentsIn ?? inf.adjustments_in ?? 0;
    const otherInflows = inf.otherInflows ?? inf.other_inflows ?? 0;
    const totalInflows = inf.totalInflows ?? inf.total_inflows ?? 0;

    const supplierPoPayments = outf.supplierPoPayments ?? outf.supplier_po_payments ?? 0;
    const operatingExpenses = outf.operatingExpenses ?? outf.operating_expenses ?? 0;
    const setupInvestment = outf.setupInvestment ?? outf.setup_investment ?? 0;
    const transfersOut = outf.transfersOut ?? outf.transfers_out ?? 0;
    const adjustmentsOut = outf.adjustmentsOut ?? outf.adjustments_out ?? 0;
    const otherOutflows = outf.otherOutflows ?? outf.other_outflows ?? 0;
    const totalOutflows = outf.totalOutflows ?? outf.total_outflows ?? 0;

    const netCashFlow = cashFlow.netCashFlow ?? cashFlow.net_cash_flow ?? (totalInflows - totalOutflows);

    const s5Data: any[][] = [
      ['KoMart Supermarket — Cash Flow & Multi-Wallet Statement'],
      [`Period: ${startDate} to ${endDate}`],
      [],
      ['=== 1. CASH INFLOWS VS OUTFLOWS ==='],
      ['Category', 'Flow Direction', 'Amount (NPR)'],
      ['POS Cash Collections', 'Inflow (+)', salesCash],
      ['POS Card / Bank Swipe Collections', 'Inflow (+)', salesBank],
      ['POS eSewa / Digital Wallet Collections', 'Inflow (+)', salesEsewa],
      ['Supplier Return Refunds Collected', 'Inflow (+)', supplierRefunds],
      ['Transfers & Other Inward Adjustments', 'Inflow (+)', transfersIn + adjustmentsIn + otherInflows],
      ['TOTAL PERIOD CASH INFLOWS', 'TOTAL INFLOW', totalInflows],
      [],
      ['Supplier PO Bill Payments', 'Outflow (-)', -supplierPoPayments],
      ['Operating Expenses (Store Overheads)', 'Outflow (-)', -operatingExpenses],
      ['Setup & Capital Investments', 'Outflow (-)', -setupInvestment],
      ['Transfers & Other Outward Adjustments', 'Outflow (-)', -(transfersOut + adjustmentsOut + otherOutflows)],
      ['TOTAL PERIOD CASH OUTFLOWS', 'TOTAL OUTFLOW', -totalOutflows],
      [],
      ['PERIOD NET CASH FLOW', 'NET DELTA', netCashFlow],
      [],
      ['=== 2. MULTI-WALLET RECONCILIATION LEDGER ==='],
      ['Wallet Account', 'Opening Balance', 'Period Inflows', 'Period Outflows', 'Net Movement', 'Closing Balance'],
    ];

    const walletsList = cashFlow.wallets || [];
    for (const w of walletsList) {
      const openBal = w.openingBalance ?? w.opening_balance ?? 0;
      const wIn = w.totalInflows ?? w.total_inflows ?? 0;
      const wOut = w.totalOutflows ?? w.total_outflows ?? 0;
      const wNet = w.netMovement ?? w.net_movement ?? 0;
      const closeBal = w.closingBalance ?? w.closing_balance ?? 0;

      s5Data.push([
        w.wallet,
        openBal,
        wIn,
        wOut,
        wNet,
        closeBal,
      ]);
    }

    const ws5 = XLSX.utils.aoa_to_sheet(s5Data);
    ws5['!cols'] = autoFitColumns(s5Data);
    XLSX.utils.book_append_sheet(wb, ws5, 'Cash Flow & Wallets');
  }

  // Write file
  const filename = `KoMart_Retail_Report_${startDate}_to_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
