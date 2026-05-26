from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from keyboards.inline import get_back_keyboard, get_home_keyboard, get_main_menu_keyboard
from states.forms import TowTruckStates
from utils import notify_admin, now_str, preserve_city_and_reset

router = Router()


@router.callback_query(F.data == "menu:tow_truck")
async def tow_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, TowTruckStates.name)
    await callback.message.edit_text(
        "🚛 <b>Вызов эвакуатора</b>\n\n👤 Шаг 1/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(TowTruckStates.name, F.data == "back")
async def tow_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    city = data.get("city", "Не указан")
    await state.set_state(None)
    await callback.message.edit_text(
        f"🏙️ Город: <b>{city}</b>\n\nВыберите раздел:",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TowTruckStates.name)
async def tow_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(TowTruckStates.phone)
    await message.answer(
        "🚛 <b>Вызов эвакуатора</b>\n\n📞 Шаг 2/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TowTruckStates.phone, F.data == "back")
async def tow_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TowTruckStates.name)
    await callback.message.edit_text(
        "🚛 <b>Вызов эвакуатора</b>\n\n👤 Шаг 1/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TowTruckStates.phone)
async def tow_phone(message: Message, state: FSMContext) -> None:
    await state.update_data(phone=message.text)
    await state.set_state(TowTruckStates.address)
    await message.answer(
        "🚛 <b>Вызов эвакуатора</b>\n\n📍 Шаг 3/4 — Введите ваш адрес / местоположение:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TowTruckStates.address, F.data == "back")
async def tow_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TowTruckStates.phone)
    await callback.message.edit_text(
        "🚛 <b>Вызов эвакуатора</b>\n\n📞 Шаг 2/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TowTruckStates.address)
async def tow_address(message: Message, state: FSMContext) -> None:
    await state.update_data(address=message.text)
    await state.set_state(TowTruckStates.when)
    await message.answer(
        "🚛 <b>Вызов эвакуатора</b>\n\n⏰ Шаг 4/4 — Когда нужен эвакуатор?\n"
        "<i>(например: «Сейчас», «Завтра в 10:00», «01.06 в 14:00»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(TowTruckStates.when, F.data == "back")
async def tow_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(TowTruckStates.address)
    await callback.message.edit_text(
        "🚛 <b>Вызов эвакуатора</b>\n\n📍 Шаг 3/4 — Введите ваш адрес / местоположение:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(TowTruckStates.when)
async def tow_when(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(when=message.text)
    data = await state.get_data()
    await state.set_state(None)

    admin_text = (
        f"🚛 <b>НОВАЯ ЗАЯВКА — Эвакуатор</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📍 Адрес: {data.get('address', '—')}\n"
        f"⏰ Когда: {data.get('when', '—')}\n"
        f"📅 Дата заявки: {now_str()}"
    )
    await notify_admin(bot, admin_text)

    await message.answer(
        "✅ <b>Заявка принята!</b>\n\nЭвакуатор будет направлен по вашему адресу.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )
