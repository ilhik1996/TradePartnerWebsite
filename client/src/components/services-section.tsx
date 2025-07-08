import { Globe, Package, Handshake, Truck, TrendingUp, Shield } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';

const serviceIcons = {
  sourcing: Globe,
  procurement: Package,
  partnership: Handshake,
  logistics: Truck,
  analysis: TrendingUp,
  quality: Shield
};

const serviceColors = {
  sourcing: 'bg-blue-100 text-blue-600',
  procurement: 'bg-green-100 text-green-600',
  partnership: 'bg-purple-100 text-purple-600',
  logistics: 'bg-orange-100 text-orange-600',
  analysis: 'bg-red-100 text-red-600',
  quality: 'bg-teal-100 text-teal-600'
};

export function ServicesSection() {
  const { t } = useLanguage();

  const services = [
    {
      key: 'sourcing',
      icon: serviceIcons.sourcing,
      color: serviceColors.sourcing,
      title: t.services.cards.sourcing.title,
      description: t.services.cards.sourcing.description
    },
    {
      key: 'procurement',
      icon: serviceIcons.procurement,
      color: serviceColors.procurement,
      title: t.services.cards.procurement.title,
      description: t.services.cards.procurement.description
    },
    {
      key: 'partnership',
      icon: serviceIcons.partnership,
      color: serviceColors.partnership,
      title: t.services.cards.partnership.title,
      description: t.services.cards.partnership.description
    },
    {
      key: 'logistics',
      icon: serviceIcons.logistics,
      color: serviceColors.logistics,
      title: t.services.cards.logistics.title,
      description: t.services.cards.logistics.description
    },
    {
      key: 'analysis',
      icon: serviceIcons.analysis,
      color: serviceColors.analysis,
      title: t.services.cards.analysis.title,
      description: t.services.cards.analysis.description
    },
    {
      key: 'quality',
      icon: serviceIcons.quality,
      color: serviceColors.quality,
      title: t.services.cards.quality.title,
      description: t.services.cards.quality.description
    }
  ];

  return (
    <section id="services" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-slide-up">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">{t.services.title}</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t.services.subtitle}
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <div
                key={service.key}
                className="service-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 border border-slate-100 animate-scale-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center mb-6 ${service.color}`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold text-slate-800 mb-4">{service.title}</h3>
                <p className="text-slate-600 leading-relaxed">{service.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
