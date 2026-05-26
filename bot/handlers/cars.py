from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from keyboards.inline import (
    get_back_keyboard,
    get_cars_keyboard,
    get_home_keyboard,
    get_skip_back_keyboard,
)
from states.forms import (
    NewCarStates,
    SellCarStates,
    TradeInStates,
    UsedCarStates,
)
from utils import get_city, notify_admin, now_str, preserve_city_and_reset

router = Router()


# ─── Cars submenu ────────────────────────────────────────────────────────────

@router.callback_query(F.data == "menu:cars")
async def show_cars_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🚗 <b>Купить / Продать авто</b>\n\nВыберите опцию:",
        reply_markup=get_cars_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


# ─── TRADE-IN ────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cars:trade_in")
async def tradein_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, TradeInStates.credit_score)
    await callback.message.edit_text(
        "🔄 <b>Trade-In</b>\n\n💳 Шаг 1/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 650, 720, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(TradeInStates.credit_score, F.data == "back")
async def tradein_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🚗 <b>Купить / Продать авто</b>\n\nВыберите опцию:",
        reply_markup=get_cars_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TradeInStates.credit_score)
async def tradein_credit_score(message: Message, state: FSMContext) -> None:
    await state.update_data(credit_score=message.text)
    await state.set_state(TradeInStates.car_info)
    await message.answer(
        "🔄 <b>Trade-In</b>\n\n🚘 Шаг 2/4 — Введите марку, модель и год авто:\n"
        "<i>(например: Toyota Camry 2020)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TradeInStates.car_info, F.data == "back")
async def tradein_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TradeInStates.credit_score)
    await callback.message.edit_text(
        "🔄 <b>Trade-In</b>\n\n💳 Шаг 1/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 650, 720, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TradeInStates.car_info)
async def tradein_car_info(message: Message, state: FSMContext) -> None:
    await state.update_data(car_info=message.text)
    await state.set_state(TradeInStates.name)
    await message.answer(
        "🔄 <b>Trade-In</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TradeInStates.name, F.data == "back")
async def tradein_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TradeInStates.car_info)
    await callback.message.edit_text(
        "🔄 <b>Trade-In</b>\n\n🚘 Шаг 2/4 — Введите марку, модель и год авто:\n"
        "<i>(например: Toyota Camry 2020)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TradeInStates.name)
async def tradein_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(TradeInStates.phone)
    await message.answer(
        "🔄 <b>Trade-In</b>\n\n📞 Шаг 4/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TradeInStates.phone, F.data == "back")
async def tradein_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TradeInStates.name)
    await callback.message.edit_text(
        "🔄 <b>Trade-In</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TradeInStates.phone)
async def tradein_phone(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(phone=message.text)
    data = await state.get_data()
    await state.set_state(None)

    admin_text = (
        f"🔄 <b>НОВАЯ ЗАЯВКА — Trade-In</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"💳 Кредитный скор: {data.get('credit_score', '—')}\n"
        f"🚘 Авто: {data.get('car_info', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text)

    await message.answer(
        "✅ <b>Заявка на Trade-In принята!</b>\n\n"
        "Наш менеджер свяжется с вами в ближайшее время.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )


# ─── NEW CAR ─────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cars:new")
async def newcar_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, NewCarStates.desired_car)
    await callback.message.edit_text(
        "✨ <b>Новое авто</b>\n\n🚗 Шаг 1/4 — Какой автомобиль вас интересует?\n"
        "<i>(марка, модель, комплектация)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(NewCarStates.desired_car, F.data == "back")
async def newcar_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🚗 <b>Купить / Продать авто</b>\n\nВыберите опцию:",
        reply_markup=get_cars_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(NewCarStates.desired_car)
async def newcar_desired(message: Message, state: FSMContext) -> None:
    await state.update_data(desired_car=message.text)
    await state.set_state(NewCarStates.credit_score)
    await message.answer(
        "✨ <b>Новое авто</b>\n\n💳 Шаг 2/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 650, 720, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(NewCarStates.credit_score, F.data == "back")
async def newcar_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(NewCarStates.desired_car)
    await callback.message.edit_text(
        "✨ <b>Новое авто</b>\n\n🚗 Шаг 1/4 — Какой автомобиль вас интересует?\n"
        "<i>(марка, модель, комплектация)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(NewCarStates.credit_score)
async def newcar_credit(message: Message, state: FSMContext) -> None:
    await state.update_data(credit_score=message.text)
    await state.set_state(NewCarStates.name)
    await message.answer(
        "✨ <b>Новое авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(NewCarStates.name, F.data == "back")
async def newcar_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(NewCarStates.credit_score)
    await callback.message.edit_text(
        "✨ <b>Новое авто</b>\n\n💳 Шаг 2/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 650, 720, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(NewCarStates.name)
async def newcar_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(NewCarStates.phone)
    await message.answer(
        "✨ <b>Новое авто</b>\n\n📞 Шаг 4/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(NewCarStates.phone, F.data == "back")
async def newcar_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(NewCarStates.name)
    await callback.message.edit_text(
        "✨ <b>Новое авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(NewCarStates.phone)
async def newcar_phone(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(phone=message.text)
    data = await state.get_data()
    await state.set_state(None)

    admin_text = (
        f"✨ <b>НОВАЯ ЗАЯВКА — Новое авто</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"🚗 Желаемое авто: {data.get('desired_car', '—')}\n"
        f"💳 Кредитный скор: {data.get('credit_score', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text)

    await message.answer(
        "✅ <b>Заявка принята!</b>\n\n"
        "Наш менеджер свяжется с вами в ближайшее время.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )


# ─── USED CAR ────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cars:used")
async def usedcar_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, UsedCarStates.credit_score)
    await callback.message.edit_text(
        "🔍 <b>Б/У авто</b>\n\n💳 Шаг 1/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 580, 700, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(UsedCarStates.credit_score, F.data == "back")
async def usedcar_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🚗 <b>Купить / Продать авто</b>\n\nВыберите опцию:",
        reply_markup=get_cars_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(UsedCarStates.credit_score)
async def usedcar_credit(message: Message, state: FSMContext) -> None:
    await state.update_data(credit_score=message.text)
    await state.set_state(UsedCarStates.desired_car)
    await message.answer(
        "🔍 <b>Б/У авто</b>\n\n🚘 Шаг 2/4 — Введите желаемое авто:\n"
        "<i>(марка, модель, бюджет — например: Toyota Camry, до $15,000)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(UsedCarStates.desired_car, F.data == "back")
async def usedcar_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(UsedCarStates.credit_score)
    await callback.message.edit_text(
        "🔍 <b>Б/У авто</b>\n\n💳 Шаг 1/4 — Введите ваш кредитный скор:\n"
        "<i>(например: 580, 700, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(UsedCarStates.desired_car)
async def usedcar_desired(message: Message, state: FSMContext) -> None:
    await state.update_data(desired_car=message.text)
    await state.set_state(UsedCarStates.name)
    await message.answer(
        "🔍 <b>Б/У авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(UsedCarStates.name, F.data == "back")
async def usedcar_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(UsedCarStates.desired_car)
    await callback.message.edit_text(
        "🔍 <b>Б/У авто</b>\n\n🚘 Шаг 2/4 — Введите желаемое авто:\n"
        "<i>(марка, модель, бюджет — например: Toyota Camry, до $15,000)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(UsedCarStates.name)
async def usedcar_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(UsedCarStates.phone)
    await message.answer(
        "🔍 <b>Б/У авто</b>\n\n📞 Шаг 4/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(UsedCarStates.phone, F.data == "back")
async def usedcar_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(UsedCarStates.name)
    await callback.message.edit_text(
        "🔍 <b>Б/У авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(UsedCarStates.phone)
async def usedcar_phone(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(phone=message.text)
    data = await state.get_data()
    await state.set_state(None)

    admin_text = (
        f"🔍 <b>НОВАЯ ЗАЯВКА — Б/У авто</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"💳 Кредитный скор: {data.get('credit_score', '—')}\n"
        f"🚘 Желаемое авто: {data.get('desired_car', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text)

    await message.answer(
        "✅ <b>Заявка принята!</b>\n\n"
        "Наш менеджер свяжется с вами в ближайшее время.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )


# ─── SELL CAR ────────────────────────────────────────────────────────────────

@router.callback_query(F.data == "cars:sell")
async def sellcar_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, SellCarStates.car_info)
    await callback.message.edit_text(
        "💰 <b>Продать своё авто</b>\n\n"
        "🚘 Шаг 1/4 — Введите марку, модель, год и пробег:\n"
        "<i>(например: Honda Civic 2018, 45,000 миль)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(SellCarStates.car_info, F.data == "back")
async def sellcar_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🚗 <b>Купить / Продать авто</b>\n\nВыберите опцию:",
        reply_markup=get_cars_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(SellCarStates.car_info)
async def sellcar_car_info(message: Message, state: FSMContext) -> None:
    await state.update_data(car_info=message.text)
    await state.set_state(SellCarStates.photo)
    await message.answer(
        "💰 <b>Продать своё авто</b>\n\n"
        "📷 Шаг 2/4 — Прикрепите фото автомобиля\n"
        "<i>(или нажмите «Пропустить»)</i>",
        reply_markup=get_skip_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(SellCarStates.photo, F.data == "back")
async def sellcar_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(SellCarStates.car_info)
    await callback.message.edit_text(
        "💰 <b>Продать своё авто</b>\n\n"
        "🚘 Шаг 1/4 — Введите марку, модель, год и пробег:\n"
        "<i>(например: Honda Civic 2018, 45,000 миль)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(SellCarStates.photo, F.photo)
async def sellcar_photo(message: Message, state: FSMContext) -> None:
    await state.update_data(photo_id=message.photo[-1].file_id)
    await state.set_state(SellCarStates.name)
    await message.answer(
        "💰 <b>Продать своё авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(SellCarStates.photo, F.data == "skip_photo")
async def sellcar_skip_photo(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(photo_id=None)
    await state.set_state(SellCarStates.name)
    await callback.message.edit_text(
        "💰 <b>Продать своё авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(SellCarStates.name, F.data == "back")
async def sellcar_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(SellCarStates.photo)
    await callback.message.edit_text(
        "💰 <b>Продать своё авто</b>\n\n"
        "📷 Шаг 2/4 — Прикрепите фото автомобиля\n"
        "<i>(или нажмите «Пропустить»)</i>",
        reply_markup=get_skip_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(SellCarStates.name)
async def sellcar_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(SellCarStates.phone)
    await message.answer(
        "💰 <b>Продать своё авто</b>\n\n📞 Шаг 4/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(SellCarStates.phone, F.data == "back")
async def sellcar_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(SellCarStates.name)
    await callback.message.edit_text(
        "💰 <b>Продать своё авто</b>\n\n👤 Шаг 3/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(SellCarStates.phone)
async def sellcar_phone(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(phone=message.text)
    data = await state.get_data()
    photo_id = data.get("photo_id")
    await state.set_state(None)

    admin_text = (
        f"💰 <b>НОВАЯ ЗАЯВКА — Продажа авто</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"🚘 Авто: {data.get('car_info', '—')}\n"
        f"📷 Фото: {'прикреплено' if photo_id else 'не добавлено'}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text, photo_file_id=photo_id)

    await message.answer(
        "✅ <b>Заявка на продажу принята!</b>\n\n"
        "Наш менеджер свяжется с вами в ближайшее время.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )
