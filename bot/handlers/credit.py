from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from keyboards.inline import get_back_keyboard, get_home_keyboard, get_main_menu_keyboard
from states.forms import CreditBoostStates
from utils import notify_admin, now_str, preserve_city_and_reset

router = Router()


@router.callback_query(F.data == "menu:credit")
async def credit_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, CreditBoostStates.credit_score)
    await callback.message.edit_text(
        "🏆 <b>Буст кредитной истории</b>\n\n"
        "💳 Шаг 1/3 — Введите ваш текущий кредитный скор:\n"
        "<i>(например: 520, 600, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(CreditBoostStates.credit_score, F.data == "back")
async def credit_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    city = data.get("city", "Не указан")
    await state.set_state(None)
    await callback.message.edit_text(
        f"🏙️ Город: <b>{city}</b>\n\nВыберите раздел:",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(CreditBoostStates.credit_score)
async def credit_score(message: Message, state: FSMContext) -> None:
    await state.update_data(credit_score=message.text)
    await state.set_state(CreditBoostStates.name)
    await message.answer(
        "🏆 <b>Буст кредитной истории</b>\n\n👤 Шаг 2/3 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(CreditBoostStates.name, F.data == "back")
async def credit_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(CreditBoostStates.credit_score)
    await callback.message.edit_text(
        "🏆 <b>Буст кредитной истории</b>\n\n"
        "💳 Шаг 1/3 — Введите ваш текущий кредитный скор:\n"
        "<i>(например: 520, 600, «Не знаю»)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(CreditBoostStates.name)
async def credit_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(CreditBoostStates.phone)
    await message.answer(
        "🏆 <b>Буст кредитной истории</b>\n\n📞 Шаг 3/3 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(CreditBoostStates.phone, F.data == "back")
async def credit_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(CreditBoostStates.name)
    await callback.message.edit_text(
        "🏆 <b>Буст кредитной истории</b>\n\n👤 Шаг 2/3 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(CreditBoostStates.phone)
async def credit_phone(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(phone=message.text)
    data = await state.get_data()
    await state.set_state(None)

    admin_text = (
        f"🏆 <b>НОВАЯ ЗАЯВКА — Буст кредитной истории</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"💳 Текущий кредитный скор: {data.get('credit_score', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text)

    await message.answer(
        "✅ <b>Заявка принята!</b>\n\n"
        "Наш специалист свяжется с вами в ближайшее время.",
        reply_markup=get_home_keyboard(),
        parse_mode="HTML",
    )
