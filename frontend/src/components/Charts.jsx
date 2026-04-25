import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'

const COLORS = {
  in:  '#22c77a',
  out: '#f74f6b',
  deposit: '#22c77a',
  withdrawal: '#f74f6b',
  transfer_in:  '#4f8ef7',
  transfer_out: '#f7c94f',
}

const PIE_COLORS = ['#4f8ef7', '#7c5ef7', '#22c77a', '#f7c94f', '#f74f6b', '#22d3ee']

const fmtMoney = (v) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const tooltipStyle = {
  background: '#111318',
  border: '1px solid #353a47',
  borderRadius: 8,
  color: '#e8eaf0',
}

/* ─── Daily In vs Out (user dashboard) ─────────────────────────────────────── */
export function DailyFlowChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLORS.in} stopOpacity={0.5} />
            <stop offset="95%" stopColor={COLORS.in} stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLORS.out} stopOpacity={0.5} />
            <stop offset="95%" stopColor={COLORS.out} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#252830" />
        <XAxis dataKey="date" stroke="#8b909e" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis stroke="#8b909e" tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="in"  stroke={COLORS.in}  fill="url(#gIn)"  name="Money In"  strokeWidth={2} />
        <Area type="monotone" dataKey="out" stroke={COLORS.out} fill="url(#gOut)" name="Money Out" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ─── Transaction Type Breakdown (pie) ─────────────────────────────────────── */
export function TypeBreakdownPie({ data }) {
  const chart = data.map(d => ({
    name: d.type.replace('_', ' '),
    value: d.total_amount,
    count: d.count,
  }))
  if (chart.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>No data yet</div>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={chart} dataKey="value" nameKey="name" cx="50%" cy="50%"
             outerRadius={80} innerRadius={45} paddingAngle={2}>
          {chart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [fmtMoney(v), `${p.payload.name} (${p.payload.count})`]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ─── Account Balance Distribution ─────────────────────────────────────────── */
export function BalanceBars({ data }) {
  const chart = data.map(d => ({
    name: d.account_number.slice(-5),
    type: d.account_type,
    balance: d.balance,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#252830" />
        <XAxis dataKey="name" stroke="#8b909e" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8b909e" tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v)}
                 labelFormatter={(l, p) => p[0] ? `${p[0].payload.type} • ${p[0].payload.name}` : ''} />
        <Bar dataKey="balance" fill="#4f8ef7" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── Admin: Daily Volume Stack (deposit / withdrawal / transfers) ───────── */
export function DailyVolumeStack({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#252830" />
        <XAxis dataKey="date" stroke="#8b909e" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis stroke="#8b909e" tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="deposit"      stackId="a" fill={COLORS.deposit}      name="Deposits" />
        <Bar dataKey="withdrawal"   stackId="a" fill={COLORS.withdrawal}   name="Withdrawals" />
        <Bar dataKey="transfer_out" stackId="a" fill={COLORS.transfer_out} name="Transfers Out" />
        <Bar dataKey="transfer_in"  stackId="a" fill={COLORS.transfer_in}  name="Transfers In" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── Admin: Transaction count per type (line) ─────────────────────────────── */
export function CountLine({ data }) {
  if (!data?.length) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>No data yet</div>
  }
  const chart = data.map(d => ({ name: d.type.replace('_', ' '), count: d.count }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#252830" />
        <XAxis dataKey="name" stroke="#8b909e" tick={{ fontSize: 11 }} />
        <YAxis stroke="#8b909e" tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="count" stroke="#7c5ef7" strokeWidth={3} dot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
