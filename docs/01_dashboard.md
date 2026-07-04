# Task: Rebuild the Executive Dashboard to full parity with the legacy PHP version

The current dashboard is a bland placeholder. The legacy one (index.php + api.php) is an interactive executive dashboard with cross-filtering drilldowns, 8 charts, target lines, growth badges, and a bonus calculator. Rebuild it exactly as specified below using Recharts (or Chart.js via react-chartjs-2 if mixed bar+line with dual axes is easier there — pick one and stay consistent).

## Global filter state (top filter bar)

One shared filter state drives EVERY chart and KPI on the page:
`{ period, monthPick, rangeStart, rangeEnd, groupBy, minTarget, maxTarget, drills: { company, category, manager } }`

**Time Period select** with options: Today / This Week / This Month (default) / This Quarter / This Year / All Time (Historical) / Specific Month / Custom Date Range. Exact legacy date logic:
- Today: start = end = today
- This Week: start = Sunday of current week, groupBy day
- This Month: start = 1st of month, groupBy day
- This Quarter: start = Jan 1 of current year, groupBy quarter (yes, legacy uses Jan 1 — keep it)
- This Year: start = Jan 1, groupBy month
- All Time: start = 2000-01-01, groupBy year
- Specific Month: shows a month picker; start = 1st of picked month; end = today if current month, else last day of that month; groupBy day
- Custom Date Range: shows Start Date + End Date inputs AND a "Group Chart By" select (Daily / Weekly / Monthly / Quarterly / Yearly) that controls the timeline chart bucketing

**Targets (Min / Max)** — two number inputs (defaults 100,000 / 200,000, step 10,000). These draw dashed horizontal target lines on the Sales Performance and Company Performance charts and re-render on change.

**Performance Bonus widget** — a % input (default 1, step 0.1) beside the label; below it a large indigo amount = currentFilteredRevenue × percent / 100, live-updating with every filter/drill change. Caption: "Calculated from currently filtered revenue".

**Apply button** with sync icon triggers refetch (also refetch on every control change).

## Drilldown system (the core feature)

Clicking a bar/slice cross-filters the ENTIRE dashboard:
- Company Performance bar click → drills.company = that company (click again to clear)
- Category doughnut slice OR category legend row click → drills.category
- Account Managers bar click → drills.manager (special value "Unassigned" = companies with no row in company_assignments; manager X = companies assigned to X in company_assignments)
- Active drills render as removable filter chips in a "Filtered By:" row under the filter bar: pill chips with an icon (building / pie / users), the value, and an × to remove. Plus a red "Clear All" link. Row hidden when no drills active.
- Drills combine with each other AND with the date filter in every query. Cursor becomes pointer when hovering clickable chart elements.

## KPI cards (5, colored left-border accent, hover lift, faint oversized icon bottom-right)

1. **Total Revenue** (indigo) = Σ total_nam_amount. Below it two badges:
   - Growth badge (only for period = month / custom_month / year): vs previous calendar month — "↑ 12.3% (+₱123,456.78)" green if ≥0 else red ↓, with subcaption "VS PREVIOUS PERIOD". Previous period = previous calendar month of the range start, with the same drills applied. If previous = 0, growth = 100% when current > 0 else 0.
   - Target badge (always): "{pct}% of ₱X Target" where the revenue target scales by period from a 2,500,000/month base: today = /30, week = /4, quarter = ×(month-of-quarter), year = ×(current month number), all_time = ×36, custom range = /30 × number of days. Green with ↑ icon when met, else indigo with bullseye icon.
2. **Net Profit** (green) = Σ income, with its own identical growth badge (profit vs previous month) and "Margin: X%" line (profit/revenue×100, 1 decimal).
3. **Total Collected** (blue) = Σ total_nam_amount where payment_status = 'Paid'; sub-line "Unpaid: ₱X" in red (everything not Paid).
4. **Avg. Order Value** (yellow) = revenue / order count; sub-line "{n} Orders".
5. **Stock Alerts** (red) = count of products where current_stock ≤ reorder_level; sub-link "View Inventory →" to the products page. (This card ignores date filters — it's live inventory.)

## Charts (exact layout: rows of 8/4, 8/4, then 3/3/3/3 columns, then full-width matrix)

1. **Sales Performance** (8 cols, h~320): COMBO chart on time buckets per groupBy — Revenue as indigo semi-transparent bars + "Sales Trend" indigo line (tension) + "Profit Margin" yellow dashed line on a RIGHT y-axis (%) + Max Target green dashed line + Min Target red dashed line. Left axis ₱-formatted, titles "Revenue (PHP)" / "Margin (%)" / "Timeline". Legend at bottom with point-style markers. Bucket labels: day "Feb 03", week "Week 6, 2026", month "Feb 2026", quarter "Q1 2026", year "2026".
2. **Logistics Status** (4 cols): doughnut (70% cutout) Delivered (green) vs Pending (yellow), counts of rows by date_delivered null/not-null within filters, legend right.
3. **Company Performance** (8 cols): vertical bar chart of Σ revenue per company, ALL companies (sorted desc), inside a HORIZONTALLY SCROLLABLE container whose width = max(800, companies × 60)px so nothing is squished. Bars colored by that company's account manager using this fixed palette: Anne #419CA1, Cherry #AFD5F7 (dark text), Glenda #007725, Ivy #AA338A, Ally blue, Hannah #FC0FC0, Unassigned #cbd5e1 — matched case-insensitively by first name within employee_name. A row of colored legend pills above the chart shows these managers. X labels = first word of company name, rotated up to 45°; tooltip shows full company name, value, and "Account Manager: X". Value data-labels on top of bars. Min/Max Target dashed lines overlay (legend shows only the target lines, not the bars). Header has "Click bar to filter" hint and, for Super Admin only, a "⚙ Setup" button linking to the Assignments admin (see 09_admin). Clicking a bar toggles the company drill.
4. **Account Managers** (4 cols): horizontal bar of Σ revenue per manager (companies rolled up via company_assignments; unassigned bucket = "Unassigned"), sorted desc, bars in the manager palette, value labels at bar ends, tooltip "₱X (N Companies)". Click = manager drill.
5. **By Category** (3 cols): doughnut (70% cutout, white 2px slice borders), sorted desc, 8-color rotating palette (#6366f1 #10b981 #f59e0b #ef4444 #0ea5e9 #8b5cf6 #ec4899 #f97316). NO native legend; instead a custom scrollable HTML legend below (max-height ~130px, slim scrollbar): each row = color dot + truncated category name + ₱ total, hover highlight, and CLICKING A LEGEND ROW ALSO TOGGLES THE CATEGORY DRILL. Slice click drills too.
6. **Collection Status** (3 cols): doughnut (65% cutout) of Σ revenue Paid (green) vs Unpaid (red, = any status ≠ 'Paid'), ₱ tooltips, legend bottom.
7. **Top Products** (3 cols): horizontal bar, top 10 items by Σ revenue, sky-blue bars, labels truncated to 15 chars + "…".
8. **Supplier Costs** (3 cols): horizontal bar, top 5 suppliers by Σ total_actual_amount (supplier ≠ ''), red bars.

## Detailed Sales Matrix (full-width card at bottom)

Expandable drill-down table: header "Category / Item | Qty Sold | Total Revenue | Net Profit". One parent row per category (Σ qty, Σ revenue in indigo, Σ profit in green, sorted by revenue desc) with a chevron; clicking a parent row expands a nested light-gray sub-table of that category's items (item name, qty, ₱ sales, ₱ profit, sorted by sales desc). Chevron rotates right→down; parent row highlights while open. All figures respect the global filters/drills.

## Data layer

Build one `useDashboardData(filters)` hook that runs the aggregations (Postgres RPC function(s) or parallel Supabase queries — an RPC `dashboard_stats(start, end, group_by, company, category, manager)` returning the JSON shape of the legacy api.php is the clean approach). Also subscribe to Supabase Realtime on `sales` and invalidate on change (replaces the legacy 30s polling). Show skeleton loaders per card/chart, not a full-page spinner.

## Acceptance checklist

- With period = This Month and no drills, Total Revenue matches `select sum(total_nam_amount) from sales where date >= date_trunc('month', now())::date`.
- Clicking a company bar filters ALL 8 charts + 5 KPIs + matrix; chip appears; × on chip or Clear All restores.
- Manager drill on "Unassigned" shows only companies not present in company_assignments.
- Custom Date Range with Group By = Monthly re-buckets the timeline chart into months.
- Changing Min/Max target inputs redraws the dashed lines without refetching data.
- Bonus widget updates instantly when a drill changes the filtered revenue.
- Growth badges appear ONLY for month / specific-month / year periods and compare against the previous calendar month with drills applied.
