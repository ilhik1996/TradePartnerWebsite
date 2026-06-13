import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Partner {
  id: number;
  name: string;
  category: string;
  description?: string;
  logoUrl?: string;
  cashbackPercent: number;
  isActive: boolean;
}

export default function Partners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.partners.list().then(setPartners).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = partners.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())
  );

  const categoryIcon: Record<string, string> = {
    food: '🍔', retail: '🛍️', pharmacy: '💊', telecom: '📱', fuel: '⛽', entertainment: '🎬',
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Partners</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Pay with your VIONA balance and earn cashback.</p>
      </div>

      {/* Info banner */}
      <div className="viona-card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14 }}>
        <span style={{ fontSize: 20 }}>🏪</span>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Show your VIONA app at any partner location to pay with your balance. Cashback is credited automatically within 24 hours.
        </p>
      </div>

      {/* Search */}
      <input
        className="viona-input"
        placeholder="Search partners..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, width: '100%', boxSizing: 'border-box' }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading partners...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p>No partners found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(p => (
            <div key={p.id} className="viona-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              {/* Logo */}
              <div style={{
                width: 52, height: 52, borderRadius: 12, background: 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 24, border: '1px solid var(--border)',
              }}>
                {p.logoUrl ? (
                  <img src={p.logoUrl} alt={p.name} style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover' }} />
                ) : (
                  categoryIcon[p.category] ?? '🏪'
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: 'var(--surface-2)', color: 'var(--text-secondary)',
                  }}>
                    {categoryIcon[p.category]} {p.category}
                  </span>
                </div>
                {p.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description}
                  </p>
                )}
              </div>

              {/* Cashback */}
              {p.cashbackPercent > 0 && (
                <div style={{
                  background: 'rgba(32,201,151,0.12)', borderRadius: 10, padding: '6px 10px',
                  textAlign: 'center', flexShrink: 0,
                }}>
                  <div style={{ fontWeight: 900, color: 'var(--teal)', fontSize: 18, lineHeight: 1 }}>
                    {p.cashbackPercent}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--teal)' }}>back</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
