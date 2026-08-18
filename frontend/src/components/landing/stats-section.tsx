const STATS = [
  { value: '+98%', label: 'Précision Offline' },
  { value: '100%', label: 'Digitalisé' },
  { value: '-50%', label: 'Retards de paiement' },
  { value: '24/7', label: 'Disponibilité' },
];

export function StatsSection() {
  return (
    <section className="border-y border-slate-200 bg-white py-10">
      <div className="mx-auto max-w-7xl px-6">
        <p className="mb-16 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
          Utilisé par les établissements d&apos;excellence
        </p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={
                i < STATS.length - 1 ? 'border-r border-slate-200 text-center' : 'text-center'
              }
            >
              <p className="text-3xl font-bold text-violet-600">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
