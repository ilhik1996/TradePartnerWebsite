from aiogram.fsm.state import State, StatesGroup


class CityStates(StatesGroup):
    waiting_city = State()


class TradeInStates(StatesGroup):
    credit_score = State()
    car_info = State()
    name = State()
    phone = State()


class NewCarStates(StatesGroup):
    desired_car = State()
    credit_score = State()
    name = State()
    phone = State()


class UsedCarStates(StatesGroup):
    credit_score = State()
    desired_car = State()
    name = State()
    phone = State()


class SellCarStates(StatesGroup):
    car_info = State()
    photo = State()
    name = State()
    phone = State()


class AfterAccidentStates(StatesGroup):
    name = State()
    phone = State()
    damage_description = State()
    photo = State()


class ScheduledServiceStates(StatesGroup):
    name = State()
    phone = State()
    car_info = State()
    work_needed = State()
    photo = State()


class CreditBoostStates(StatesGroup):
    credit_score = State()
    name = State()
    phone = State()


class TowTruckStates(StatesGroup):
    name = State()
    phone = State()
    address = State()
    when = State()


class AIAssistantStates(StatesGroup):
    waiting_question = State()
