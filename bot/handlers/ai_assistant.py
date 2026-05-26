import os

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from openai import AsyncOpenAI

from keyboards.inline import get_back_to_menu_keyboard, get_main_menu_keyboard
from states.forms import AIAssistantStates
from utils import preserve_city_and_reset

router = Router()

SYSTEM_PROMPT = (
    "Ты вежливый помощник автосервиса AutoPrime USA. "
    "Отвечай кратко и по делу. Помогай с вопросами "
    "об автомобилях, кредитах, страховке, ремонте. "
    "Отвечай на том языке, на котором пишет пользователь."
)


def get_openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


@router.callback_query(F.data == "menu:ai")
async def ai_start(callback: CallbackQuery, state: FSMContext) -> None:
    await preserve_city_and_reset(state, AIAssistantStates.waiting_question)
    await callback.message.edit_text(
        "🤖 <b>ИИ-помощник AutoPrime USA</b>\n\n"
        "Задайте любой вопрос — я помогу! 💬",
        reply_markup=get_back_to_menu_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()


@router.message(AIAssistantStates.waiting_question)
async def ai_question(message: Message, state: FSMContext) -> None:
    thinking_msg = await message.answer("🤔 Обрабатываю ваш запрос...")

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message.text},
            ],
            max_tokens=800,
            temperature=0.7,
        )
        answer = response.choices[0].message.content
    except Exception as e:
        answer = (
            "⚠️ К сожалению, ИИ-помощник временно недоступен.\n"
            "Пожалуйста, обратитесь к нашим менеджерам напрямую."
        )

    await thinking_msg.delete()
    await message.answer(
        f"🤖 <b>ИИ-помощник:</b>\n\n{answer}",
        reply_markup=get_back_to_menu_keyboard(),
        parse_mode="HTML",
    )
