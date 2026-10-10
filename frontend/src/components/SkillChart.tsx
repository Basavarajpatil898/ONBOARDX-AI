import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function SkillChart({ data }: { data: { name: string; current: number; target: number }[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={5} margin={{ top: 8, right: 8, left: -20, bottom: 2 }}>
          <CartesianGrid vertical={false} stroke="#e2e9f3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#687792', fontSize: 11 }} />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={{ fill: '#8491a8', fontSize: 10 }} />
          <Tooltip cursor={{ fill: '#edf3fc' }} contentStyle={{ border: '1px solid #dce4f0', borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="current" name="Current level" fill="#2874f0" radius={[4, 4, 0, 0]} maxBarSize={23} />
          <Bar dataKey="target" name="Role target" fill="#9fc3fa" radius={[4, 4, 0, 0]} maxBarSize={23} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}