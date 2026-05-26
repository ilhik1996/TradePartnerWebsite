from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from keyboards.inline import (
    get_back_keyboard,
    get_home_keyboard,
    get_shop_keyboard,
    get_skip_back_keyboard,
)
from states.forms import AfterAccidentStates, ScheduledServiceStates
from utils import notify_admin, now_str, preserve_city_and_reset

router = Router()


# ─── Shop submenu ─────────────────────────────────────────────────────────────

@router.callback_query(F.data == "menu:shop")
async def show_shop_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🔧 <b>Записаться в шоп</b>\n\nВыберите тип обслуживания:",
        reply_markup=get_shop_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


# ─── AFTER ACCIDENT ───────────────────────────────────────────────────────────

@router.callback_query(F.data == "shop:accident")
async def accident_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, AfterAccidentStates.name)
    await callback.message.edit_text(
        "🚨 <b>Запись после ДТП</b>\n\n👤 Шаг 1/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(AfterAccidentStates.name, F.data == "back")
async def accident_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🔧 <b>Записаться в шоп</b>\n\nВыберите тип обслуживания:",
        reply_markup=get_shop_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(AfterAccidentStates.name)
async def accident_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(AfterAccidentStates.phone)
    await message.answer(
        "🚨 <b>Запись после ДТП</b>\n\n📞 Шаг 2/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(AfterAccidentStates.phone, F.data == "back")
async def accident_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AfterAccidentStates.name)
    await callback.message.edit_text(
        "🚨 <b>Запись после ДТП</b>\n\n👤 Шаг 1/4 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(AfterAccidentStates.phone)
async def accident_phone(message: Message, state: FSMContext) -> None:
    await state.update_data(phone=message.text)
    await state.set_state(AfterAccidentStates.damage_description)
    await message.answer(
        "🚨 <b>Запись после ДТП</b>\n\n💬 Шаг 3/4 — Опишите повреждения:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(AfterAccidentStates.damage_description, F.data == "back")
async def accident_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AfterAccidentStates.phone)
    await callback.message.edit_text(
        "🚨 <b>Запись после ДТП</b>\n\n📞 Шаг 2/4 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(AfterAccidentStates.damage_description)
async def accident_damage(message: Message, state: FSMContext) -> None:
    await state.update_data(damage_description=message.text)
    await state.set_state(AfterAccidentStates.photo)
    await message.answer(
        "🚨 <b>Запись после ДТП</b>\n\n"
        "📷 Шаг 4/4 — Прикрепите фото повреждений\n"
        "<i>(или нажмите «Пропустить»)</i>",
        reply_markup=get_skip_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(AfterAccidentStates.photo, F.data == "back")
async def accident_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AfterAccidentStates.damage_description)
    await callback.message.edit_text(
        "🚨 <b>Запись после ДТП</b>\n\n💬 Шаг 3/4 — Опишите повреждения:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(AfterAccidentStates.photo, F.photo)
async def accident_photo(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(photo_id=message.photo[-1].file_id)
    await _finish_accident(message, state, bot)


@router.callback_query(AfterAccidentStates.photo, F.data == "skip_photo")
async def accident_skip_photo(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    await state.update_data(photo_id=None)
    await callback.answer()
    await _finish_accident(callback.message, state, bot, edit=False)


async def _finish_accident(target, state: FSMContext, bot: Bot, edit: bool = False) -> None:
    data = await state.get_data()
    photo_id = data.get("photo_id")
    await state.set_state(None)

    admin_text = (
        f"🚨 <b>НОВАЯ ЗАЯВКА — После ДТП</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"💬 Повреждения: {data.get('damage_description', '—')}\n"
        f"📷 Фото: {'прикреплено' if photo_id else 'не добавлено'}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text, photo_file_id=photo_id)

    text = "✅ <b>Запись принята!</b>\n\nМы свяжемся с вами для уточнения деталей."
    from keyboards.inline import get_home_keyboard
    if edit:
        await target.edit_text(text, reply_markup=get_home_keyboard(), parse_mode="HTML")
    else:
        await target.answer(text, reply_markup=get_home_keyboard(), parse_mode="HTML")


# ─── SCHEDULED SERVICE ────────────────────────────────────────────────────────

@router.callback_query(F.data == "shop:service")
async def service_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, ScheduledServiceStates.name)
    await callback.message.edit_text(
        "⚙️ <b>Плановое обслуживание</b>\n\n👤 Шаг 1/5 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(ScheduledServiceStates.name, F.data == "back")
async def service_back_step1(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(None)
    await callback.message.edit_text(
        "🔧 <b>Записаться в шоп</b>\n\nВыберите тип обслуживания:",
        reply_markup=get_shop_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(ScheduledServiceStates.name)
async def service_name(message: Message, state: FSMContext) -> None:
    await state.update_data(name=message.text)
    await state.set_state(ScheduledServiceStates.phone)
    await message.answer(
        "⚙️ <b>Плановое обслуживание</b>\n\n📞 Шаг 2/5 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(ScheduledServiceStates.phone, F.data == "back")
async def service_back_step2(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ScheduledServiceStates.name)
    await callback.message.edit_text(
        "⚙️ <b>Плановое обслуживание</b>\n\n👤 Шаг 1/5 — Введите ваше имя:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(ScheduledServiceStates.phone)
async def service_phone(message: Message, state: FSMContext) -> None:
    await state.update_data(phone=message.text)
    await state.set_state(ScheduledServiceStates.car_info)
    await message.answer(
        "⚙️ <b>Плановое обслуживание</b>\n\n🚘 Шаг 3/5 — Марка, модель, год авто:\n"
        "<i>(например: Ford F-150 2019)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(ScheduledServiceStates.car_info, F.data == "back")
async def service_back_step3(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ScheduledServiceStates.phone)
    await callback.message.edit_text(
        "⚙️ <b>Плановое обслуживание</b>\n\n📞 Шаг 2/5 — Введите номер телефона:",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(ScheduledServiceStates.car_info)
async def service_car_info(message: Message, state: FSMContext) -> None:
    await state.update_data(car_info=message.text)
    await state.set_state(ScheduledServiceStates.work_needed)
    await message.answer(
        "⚙️ <b>Плановое обслуживание</b>\n\n🔩 Шаг 4/5 — Что нужно сделать / что сломано?",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(ScheduledServiceStates.work_needed, F.data == "back")
async def service_back_step4(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ScheduledServiceStates.car_info)
    await callback.message.edit_text(
        "⚙️ <b>Плановое обслуживание</b>\n\n🚘 Шаг 3/5 — Марка, модель, год авто:\n"
        "<i>(например: Ford F-150 2019)</i>",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(ScheduledServiceStates.work_needed)
async def service_work(message: Message, state: FSMContext) -> None:
    await state.update_data(work_needed=message.text)
    await state.set_state(ScheduledServiceStates.photo)
    await message.answer(
        "⚙️ <b>Плановое обслуживание</b>\n\n"
        "📷 Шаг 5/5 — Прикрепите фото\n"
        "<i>(или нажмите «Пропустить»)</i>",
        reply_markup=get_skip_back_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(ScheduledServiceStates.photo, F.data == "back")
async def service_back_step5(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ScheduledServiceStates.work_needed)
    await callback.message.edit_text(
        "⚙️ <b>Плановое обслуживание</b>\n\n🔩 Шаг 4/5 — Что нужно сделать / что сломано?",
        reply_markup=get_back_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(ScheduledServiceStates.photo, F.photo)
async def service_photo(message: Message, state: FSMContext, bot: Bot) -> None:
    await state.update_data(photo_id=message.photo[-1].file_id)
    await _finish_service(message, state, bot)


@router.callback_query(ScheduledServiceStates.photo, F.data == "skip_photo")
async def service_skip_photo(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    await state.update_data(photo_id=None)
    await callback.answer()
    await _finish_service(callback.message, state, bot, edit=False)


async def _finish_service(target, state: FSMContext, bot: Bot, edit: bool = False) -> None:
    data = await state.get_data()
    photo_id = data.get("photo_id")
    await state.set_state(None)

    admin_text = (
        f"⚙️ <b>НОВАЯ ЗАЯВКА — Плановое обслуживание</b>\n\n"
        f"🏙️ Город: {data.get('city', '—')}\n"
        f"👤 Имя: {data.get('name', '—')}\n"
        f"📞 Телефон: {data.get('phone', '—')}\n"
        f"🚘 Авто: {data.get('car_info', '—')}\n"
        f"🔩 Работы: {data.get('work_needed', '—')}\n"
        f"📷 Фото: {'прикреплено' if photo_id else 'не добавлено'}\n"
        f"📅 Дата: {now_str()}"
    )
    await notify_admin(bot, admin_text, photo_file_id=photo_id)

    text = "✅ <b>Запись принята!</b>\n\nМы свяжемся с вами для уточнения деталей."
    from keyboards.inline import get_home_keyboard
    if edit:
        await target.edit_text(text, reply_markup=get_home_keyboard(), parse_mode="HTML")
    else:
        await target.answer(text, reply_markup=get_home_keyboard(), parse_mode="HTML")
