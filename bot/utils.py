import os
from datetime import datetime

from aiogram import Bot
from aiogram.fsm.context import FSMContext


async def get_city(state: FSMContext) -> str:
    data = await state.get_data()
    return data.get("city", "Не указан")


async def preserve_city_and_reset(state: FSMContext, new_state) -> str:
    """Save city, clear FSM data, set new state, restore city."""
    data = await state.get_data()
    city = data.get("city", "Не указан")
    await state.clear()
    await state.set_state(new_state)
    await state.update_data(city=city)
    return city


def now_str() -> str:
    return datetime.now().strftime("%d.%m.%Y %H:%M")


async def notify_admin(bot: Bot, text: str, photo_file_id: str = None) -> None:
    admin_id = os.getenv("ADMIN_CHAT_ID")
    if not admin_id:
        return
    try:
        if photo_file_id:
            await bot.send_photo(
                chat_id=int(admin_id),
                photo=photo_file_id,
                caption=text,
                parse_mode="HTML",
            )
        else:
            await bot.send_message(
                chat_id=int(admin_id),
                text=text,
                parse_mode="HTML",
            )
    except Exception as e:
        print(f"Admin notify error: {e}")
