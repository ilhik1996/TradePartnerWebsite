import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLanguage } from '@/hooks/use-language';

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ? 'glass-effect shadow-lg' : 'bg-white/95 backdrop-blur-sm'
    } border-b border-slate-200`}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">IIG</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Israilov Import Group</h1>
              <p className="text-sm text-slate-600">Global Procurement Solutions</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-8">
            <button
              onClick={() => scrollToSection('hero')}
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              {t.nav.home}
            </button>
            <button
              onClick={() => scrollToSection('services')}
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              {t.nav.services}
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              {t.nav.about}
            </button>
            <button
              onClick={() => scrollToSection('gallery')}
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              {t.nav.gallery}
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              {t.nav.contact}
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <LanguageSwitcher />
            
            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-slate-600" />
              ) : (
                <Menu className="w-6 h-6 text-slate-600" />
              )}
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 py-4">
            <div className="flex flex-col space-y-4">
              <button
                onClick={() => scrollToSection('hero')}
                className="text-left text-slate-700 hover:text-blue-600 transition-colors font-medium"
              >
                {t.nav.home}
              </button>
              <button
                onClick={() => scrollToSection('services')}
                className="text-left text-slate-700 hover:text-blue-600 transition-colors font-medium"
              >
                {t.nav.services}
              </button>
              <button
                onClick={() => scrollToSection('about')}
                className="text-left text-slate-700 hover:text-blue-600 transition-colors font-medium"
              >
                {t.nav.about}
              </button>
              <button
                onClick={() => scrollToSection('gallery')}
                className="text-left text-slate-700 hover:text-blue-600 transition-colors font-medium"
              >
                {t.nav.gallery}
              </button>
              <button
                onClick={() => scrollToSection('contact')}
                className="text-left text-slate-700 hover:text-blue-600 transition-colors font-medium"
              >
                {t.nav.contact}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
