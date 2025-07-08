import { useLanguage } from '@/hooks/use-language';

export function AboutSection() {
  const { t } = useLanguage();

  const stats = [
    { value: '10+', label: t.about.stats.experience },
    { value: '50+', label: t.about.stats.partners },
    { value: '100+', label: t.about.stats.projects },
    { value: '24/7', label: t.about.stats.support }
  ];

  return (
    <section id="about" className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-slide-up">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6">
              {t.about.title}
            </h2>
            <p className="text-lg text-slate-600 mb-6 leading-relaxed">
              {t.about.description1}
            </p>
            <p className="text-slate-600 mb-8 leading-relaxed">
              {t.about.description2}
            </p>
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">{stat.value}</div>
                  <div className="text-slate-600">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="animate-scale-in">
            <img
              src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&h=600"
              alt="International trade logistics and business operations"
              className="rounded-xl shadow-lg w-full h-auto"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
