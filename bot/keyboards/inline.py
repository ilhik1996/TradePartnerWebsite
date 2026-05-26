from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def get_city_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌴 Los Angeles", callback_data="city:los_angeles")],
        [InlineKeyboardButton(text="🌲 Portland", callback_data="city:portland")],
        [InlineKeyboardButton(text="🏙️ Другой город", callback_data="city:other")],
    ])


def get_main_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚗 Купить / Продать авто", callback_data="menu:cars")],
        [InlineKeyboardButton(text="🔧 Записаться в шоп", callback_data="menu:shop")],
        [InlineKeyboardButton(text="🏆 Буст кредитной истории", callback_data="menu:credit")],
        [InlineKeyboardButton(text="🚛 Вызвать эвакуатор", callback_data="menu:tow_truck")],
        [InlineKeyboardButton(text="🤖 Спросить ИИ-помощника", callback_data="menu:ai")],
    ])


def get_cars_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Trade-In", callback_data="cars:trade_in")],
        [InlineKeyboardButton(text="✨ Новое авто", callback_data="cars:new")],
        [InlineKeyboardButton(text="🔍 Б/У авто", callback_data="cars:used")],
        [InlineKeyboardButton(text="💰 Продать своё авто", callback_data="cars:sell")],
        [InlineKeyboardButton(text="🔙 Назад", callback_data="go:main_menu")],
    ])


def get_shop_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚨 После ДТП", callback_data="shop:accident")],
        [InlineKeyboardButton(text="⚙️ Плановое обслуживание", callback_data="shop:service")],
        [InlineKeyboardButton(text="🔙 Назад", callback_data="go:main_menu")],
    ])


def get_back_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Назад", callback_data="back")],
    ])


def get_skip_back_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="⏭️ Пропустить", callback_data="skip_photo"),
            InlineKeyboardButton(text="🔙 Назад", callback_data="back"),
        ],
    ])


def get_home_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🏠 Главное меню", callback_data="go:main_menu")],
    ])


def get_back_to_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔙 Вернуться в меню", callback_data="go:main_menu")],
    ])
