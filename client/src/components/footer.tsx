import { useLanguage } from '@/hooks/use-language';

export function Footer() {
  const { t } = useLanguage();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-slate-900 text-slate-300 py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IIG</span>
              </div>
              <span className="font-semibold text-white">Israilov Import Group</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              {t.footer.description}
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4">{t.footer.services}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.services.cards.sourcing.title}
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.services.cards.procurement.title}
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.services.cards.partnership.title}
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.services.cards.logistics.title}
                </button>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4">{t.footer.company}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.nav.about}
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('services')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.nav.services}
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('contact')}
                  className="hover:text-blue-400 transition-colors text-left"
                >
                  {t.nav.contact}
                </button>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-4">{t.footer.connect}</h4>
            <div className="flex space-x-4">
              <a
                href="#"
                className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"
              >
                <i className="fab fa-linkedin text-sm"></i>
              </a>
              <a
                href="#"
                className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"
              >
                <i className="fab fa-twitter text-sm"></i>
              </a>
              <a
                href="#"
                className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors"
              >
                <i className="fab fa-facebook text-sm"></i>
              </a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-slate-800 mt-8 pt-8 text-center text-sm text-slate-400">
          <p>&copy; {t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
