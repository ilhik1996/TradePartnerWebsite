from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from keyboards.inline import get_city_keyboard, get_main_menu_keyboard
from states.forms import CityStates

router = Router()

WELCOME_TEXT = (
    "👋 Добро пожаловать в <b>AutoPrime USA</b> — ваш надёжный партнёр "
    "на автомобильном рынке Америки с 2010 года!\n\n"
    "🌍 Выберите ваш город:"
)


def main_menu_text(city: str) -> str:
    return f"🏙️ Город: <b>{city}</b>\n\nВыберите раздел:"


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer(WELCOME_TEXT, reply_markup=get_city_keyboard(), parse_mode="HTML")


@router.callback_query(F.data == "city:los_angeles")
async def city_la(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await state.update_data(city="Los Angeles")
    await callback.message.edit_text(
        main_menu_text("Los Angeles"),
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data == "city:portland")
async def city_portland(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await state.update_data(city="Portland")
    await callback.message.edit_text(
        main_menu_text("Portland"),
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data == "city:other")
async def city_other(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(CityStates.waiting_city)
    await callback.message.edit_text(
        "✏️ Введите название вашего города:",
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(CityStates.waiting_city)
async def city_custom(message: Message, state: FSMContext) -> None:
    city = message.text.strip()
    await state.set_state(None)
    await state.update_data(city=city)
    await message.answer(
        main_menu_text(city),
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "go:main_menu")
async def go_main_menu(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    city = data.get("city", "Не указан")
    await state.set_state(None)
    await callback.message.edit_text(
        main_menu_text(city),
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()
