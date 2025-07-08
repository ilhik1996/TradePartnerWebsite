export interface Translation {
  nav: {
    home: string;
    services: string;
    about: string;
    gallery: string;
    contact: string;
  };
  hero: {
    title: string;
    subtitle: string;
    cta1: string;
    cta2: string;
  };
  services: {
    title: string;
    subtitle: string;
    cards: {
      sourcing: {
        title: string;
        description: string;
      };
      procurement: {
        title: string;
        description: string;
      };
      partnership: {
        title: string;
        description: string;
      };
      logistics: {
        title: string;
        description: string;
      };
      analysis: {
        title: string;
        description: string;
      };
      quality: {
        title: string;
        description: string;
      };
    };
  };
  about: {
    title: string;
    description1: string;
    description2: string;
    stats: {
      experience: string;
      partners: string;
      projects: string;
      support: string;
    };
  };
  gallery: {
    title: string;
    subtitle: string;
    items: {
      meetings: string;
      warehouse: string;
      shipping: string;
      hq: string;
    };
  };
  contact: {
    title: string;
    subtitle: string;
    info: {
      email: string;
      phone: string;
      location: string;
      hours: string;
    };
    form: {
      firstName: string;
      lastName: string;
      email: string;
      company: string;
      message: string;
      submit: string;
    };
  };
  footer: {
    description: string;
    services: string;
    company: string;
    connect: string;
    copyright: string;
  };
}

export const translations: Record<string, Translation> = {
  en: {
    nav: {
      home: "Home",
      services: "Services",
      about: "About",
      gallery: "Gallery",
      contact: "Contact"
    },
    hero: {
      title: "IIG Israilov Import Group",
      subtitle: "Your trusted partner in global procurement and sourcing solutions",
      cta1: "Our Services",
      cta2: "Get In Touch"
    },
    services: {
      title: "Our Services",
      subtitle: "We provide comprehensive procurement and sourcing solutions for businesses worldwide",
      cards: {
        sourcing: {
          title: "Global Sourcing",
          description: "Direct cooperation with manufacturers and suppliers worldwide to secure the best products at competitive prices."
        },
        procurement: {
          title: "Bulk Procurement",
          description: "Specialized in large-scale procurement of consumer goods including photographic film and accessories."
        },
        partnership: {
          title: "Partnership Solutions",
          description: "Flexible and reliable partnership approach tailored to your specific business requirements."
        },
        logistics: {
          title: "Logistics Management",
          description: "End-to-end logistics coordination to ensure smooth delivery of your procured goods."
        },
        analysis: {
          title: "Market Analysis",
          description: "In-depth market research and analysis to identify the best opportunities for your business."
        },
        quality: {
          title: "Quality Assurance",
          description: "Rigorous quality control processes to ensure all products meet international standards."
        }
      }
    },
    about: {
      title: "About IIG Israilov Import Group",
      description1: "Based in Los Angeles, California, we are an independent procurement and sourcing partner dedicated to connecting businesses with reliable manufacturers and suppliers worldwide.",
      description2: "Our expertise spans across various industries with a special focus on consumer goods, photographic equipment, and accessories. We pride ourselves on our flexible approach and commitment to building long-term partnerships.",
      stats: {
        experience: "Years Experience",
        partners: "Global Partners",
        projects: "Successful Projects",
        support: "Support Available"
      }
    },
    gallery: {
      title: "Our Operations",
      subtitle: "A glimpse into our professional procurement and sourcing operations",
      items: {
        meetings: "Business Meetings",
        warehouse: "Warehouse Operations",
        shipping: "Global Shipping",
        hq: "Los Angeles HQ"
      }
    },
    contact: {
      title: "Get In Touch",
      subtitle: "Ready to discuss your procurement needs? Contact us today for a consultation",
      info: {
        email: "Email",
        phone: "Phone",
        location: "Location",
        hours: "Business Hours"
      },
      form: {
        firstName: "First Name",
        lastName: "Last Name",
        email: "Email",
        company: "Company",
        message: "Message",
        submit: "Send Message"
      }
    },
    footer: {
      description: "Your trusted partner in global procurement and sourcing solutions based in Los Angeles, CA.",
      services: "Services",
      company: "Company",
      connect: "Connect",
      copyright: "2023 IIG Israilov Import Group. All rights reserved."
    }
  },
  ru: {
    nav: {
      home: "Главная",
      services: "Услуги",
      about: "О нас",
      gallery: "Галерея",
      contact: "Контакты"
    },
    hero: {
      title: "IIG Israilov Import Group",
      subtitle: "Ваш надежный партнер в глобальных закупках и поиске поставщиков",
      cta1: "Наши услуги",
      cta2: "Связаться с нами"
    },
    services: {
      title: "Наши услуги",
      subtitle: "Мы предоставляем комплексные решения по закупкам и поиску поставщиков для бизнеса по всему миру",
      cards: {
        sourcing: {
          title: "Глобальный поиск",
          description: "Прямое сотрудничество с производителями и поставщиками по всему миру для получения лучших товаров по конкурентным ценам."
        },
        procurement: {
          title: "Оптовые закупки",
          description: "Специализируемся на крупномасштабных закупках потребительских товаров, включая фотопленку и аксессуары."
        },
        partnership: {
          title: "Партнерские решения",
          description: "Гибкий и надежный подход к партнерству, адаптированный под ваши конкретные бизнес-требования."
        },
        logistics: {
          title: "Управление логистикой",
          description: "Координация логистики от начала до конца для обеспечения бесперебойной доставки закупленных товаров."
        },
        analysis: {
          title: "Анализ рынка",
          description: "Углубленное исследование и анализ рынка для выявления лучших возможностей для вашего бизнеса."
        },
        quality: {
          title: "Контроль качества",
          description: "Строгие процессы контроля качества для обеспечения соответствия всех товаров международным стандартам."
        }
      }
    },
    about: {
      title: "О IIG Israilov Import Group",
      description1: "Базируясь в Лос-Анджелесе, Калифорния, мы являемся независимым партнером по закупкам и поиску поставщиков, посвященным соединению бизнеса с надежными производителями и поставщиками по всему миру.",
      description2: "Наша экспертиза охватывает различные отрасли с особым акцентом на потребительские товары, фотооборудование и аксессуары. Мы гордимся нашим гибким подходом и приверженностью построению долгосрочных партнерств.",
      stats: {
        experience: "Лет опыта",
        partners: "Глобальных партнеров",
        projects: "Успешных проектов",
        support: "Поддержка доступна"
      }
    },
    gallery: {
      title: "Наши операции",
      subtitle: "Взгляд на наши профессиональные операции по закупкам и поиску поставщиков",
      items: {
        meetings: "Деловые встречи",
        warehouse: "Складские операции",
        shipping: "Глобальная доставка",
        hq: "Штаб-квартира в Лос-Анджелесе"
      }
    },
    contact: {
      title: "Связаться с нами",
      subtitle: "Готовы обсудить ваши потребности в закупках? Свяжитесь с нами сегодня для консультации",
      info: {
        email: "Электронная почта",
        phone: "Телефон",
        location: "Местоположение",
        hours: "Рабочие часы"
      },
      form: {
        firstName: "Имя",
        lastName: "Фамилия",
        email: "Электронная почта",
        company: "Компания",
        message: "Сообщение",
        submit: "Отправить сообщение"
      }
    },
    footer: {
      description: "Ваш надежный партнер в глобальных закупках и поиске поставщиков, базирующийся в Лос-Анджелесе, Калифорния.",
      services: "Услуги",
      company: "Компания",
      connect: "Связаться",
      copyright: "2023 IIG Israilov Import Group. Все права защищены."
    }
  },
  es: {
    nav: {
      home: "Inicio",
      services: "Servicios",
      about: "Acerca de",
      gallery: "Galería",
      contact: "Contacto"
    },
    hero: {
      title: "IIG Grupo de Importación Israilov",
      subtitle: "Su socio de confianza en soluciones globales de abastecimiento y búsqueda de proveedores",
      cta1: "Nuestros Servicios",
      cta2: "Contáctanos"
    },
    services: {
      title: "Nuestros Servicios",
      subtitle: "Proporcionamos soluciones integrales de abastecimiento y búsqueda de proveedores para empresas de todo el mundo",
      cards: {
        sourcing: {
          title: "Búsqueda Global",
          description: "Cooperación directa con fabricantes y proveedores de todo el mundo para asegurar los mejores productos a precios competitivos."
        },
        procurement: {
          title: "Compras al Por Mayor",
          description: "Especializados en compras a gran escala de bienes de consumo, incluyendo película fotográfica y accesorios."
        },
        partnership: {
          title: "Soluciones de Asociación",
          description: "Enfoque de asociación flexible y confiable adaptado a sus requisitos comerciales específicos."
        },
        logistics: {
          title: "Gestión Logística",
          description: "Coordinación logística de extremo a extremo para garantizar la entrega fluida de sus bienes adquiridos."
        },
        analysis: {
          title: "Análisis de Mercado",
          description: "Investigación y análisis de mercado en profundidad para identificar las mejores oportunidades para su negocio."
        },
        quality: {
          title: "Aseguramiento de Calidad",
          description: "Procesos rigurosos de control de calidad para garantizar que todos los productos cumplan con los estándares internacionales."
        }
      }
    },
    about: {
      title: "Acerca de IIG Grupo de Importación Israilov",
      description1: "Con sede en Los Ángeles, California, somos un socio independiente de abastecimiento y búsqueda de proveedores dedicado a conectar empresas con fabricantes y proveedores confiables en todo el mundo.",
      description2: "Nuestra experiencia abarca varias industrias con un enfoque especial en bienes de consumo, equipos fotográficos y accesorios. Nos enorgullecemos de nuestro enfoque flexible y compromiso con la construcción de asociaciones a largo plazo.",
      stats: {
        experience: "Años de Experiencia",
        partners: "Socios Globales",
        projects: "Proyectos Exitosos",
        support: "Soporte Disponible"
      }
    },
    gallery: {
      title: "Nuestras Operaciones",
      subtitle: "Un vistazo a nuestras operaciones profesionales de abastecimiento y búsqueda de proveedores",
      items: {
        meetings: "Reuniones de Negocios",
        warehouse: "Operaciones de Almacén",
        shipping: "Envío Global",
        hq: "Sede de Los Ángeles"
      }
    },
    contact: {
      title: "Póngase en Contacto",
      subtitle: "¿Listo para discutir sus necesidades de abastecimiento? Contáctenos hoy para una consulta",
      info: {
        email: "Correo Electrónico",
        phone: "Teléfono",
        location: "Ubicación",
        hours: "Horario Comercial"
      },
      form: {
        firstName: "Nombre",
        lastName: "Apellido",
        email: "Correo Electrónico",
        company: "Empresa",
        message: "Mensaje",
        submit: "Enviar Mensaje"
      }
    },
    footer: {
      description: "Su socio de confianza en soluciones globales de abastecimiento y búsqueda de proveedores con sede en Los Ángeles, CA.",
      services: "Servicios",
      company: "Empresa",
      connect: "Conectar",
      copyright: "2023 IIG Grupo de Importación Israilov. Todos los derechos reservados."
    }
  }
};
