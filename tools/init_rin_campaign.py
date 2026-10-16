#!/usr/bin/env python3
"""Reproducible initial canonical Rin Veir state; uses established played facts only.
Does not regenerate on each run or erase a newer campaign revision.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def save(rel, obj):
    path=ROOT/rel;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding='utf-8')


def build():
    source=json.loads((ROOT/'rules/_campaign-rules.json').read_text(encoding='utf-8'))
    source.update(campaign_id='rin-veir',purpose='Полные правила самостоятельной кампании Рина Вейра на базе Campaign Engine Хейвенгарда.')
    source['narrative']['rules']=[
        'Всё художественное повествование о Рине вести от первого лица Рина: я, мне, моё.',
        'Не придумывать за Рина мысли, чувства, слова, решения или самостоятельные действия. Слова игрока вплетать без искажения.',
        'Метаигровые броски, значения ПЗ/КД и терминология правил — только в отдельном техническом блоке, не внутри прозы.',
        'NPC свободны действовать исходя из собственных мотивов, памяти, знаний, обстоятельств; без чтения мыслей и метагейминга.',
        'Мир реагирует на поступки игрока правдоподобно. Не форсировать сюжет и не предрешать исход.',
        'Неподтверждённые планы ведущего не превращаются автоматически в сюжетный канон.',
        'Восстанавливать точно последнее подтверждённое состояние перед продолжением сцены.',
        'Формулировать ответы с естественным повествовательным темпом, без повторяющихся списков вариантов.',
        'Сохранять факты, ресурсы и последствия боёв, не менять исход без сыгранных событий.',
        'Явно отделять игровые гипотезы и слухи от сведений ведущего.',
        'Не делать чужие знания автоматически знаниями Рина.',
        'Соблюдать правила D&D 2024, документировать домашние решения отдельно.',
        'Не приписывать персонажу действие только потому, что его мог бы сделать разумный человек.',
        'Учитывать прошлое, личность, пределы знаний и инициативу NPC.',
    ]
    source['character_anchors']={'rin':[
        '21 год, человек, 179 см; серо-зелёные глаза, прямые тёмно-каштановые волосы средней длины, тонкий шрам справа на шее.',
        'Уличное детство до 15 лет, шесть лет обучения в Монастыре Последнего Света.',
        'Разбойник 1 / Монах 3 (Воин Тени). Дисциплина, скрытность, боевые искусства и магическая Тьма.',
        'Отказался убить чиновника по приказу монастыря после обнаружения документов о скрытом мотиве задания. Ушёл с документами.',
        'Моральный принцип: не убивай тех, ради кого пришлось бы придумывать оправдание.',
        'Спокойный, наблюдательный, сухой юмор; нежелание брать жизнь без причины. Характер не предопределяет решения игрока.',
    ]}
    source['combat']['rules']=[
        'Бой ведётся по D&D 2024 и проверенным обработчикам rin_dnd v29R, не заменять их приблизительной симуляцией.',
        'Рин один игровой герой; NPC автоматически принимают собственные решения, без присвоения контроля над Рином.',
        'Использовать текущий ресурс фокуса, Удачи, ПЗ, боеприпасов и реальные доступные способности.',
        'Тьма Воина Тени: радиус 15 футов, центр до 60 футов; Рин видит внутри своей Тьмы. Видимость и взаимная слепота пересчитываются для каждой атаки.',
        'При неясном свойстве или редкой способности не выдавать придуманный исход за автоматический расчёт.',
        'Нелетальные рукопашные завершающие удары доступны согласно 2024 правилам; не считать пленников мёртвыми.',
        'Сюжетный бой изменяет канон только после проверки отчёта и согласования игроком. Учебный бой не меняет состояние.',
    ]
    source['city_and_population']={'rules':[
        'Системы города, населения, строительства, животных, гарнизона и реестров сохранены из Campaign Engine, но у Рина пока нет подтверждённого города.',
        'Не создавать в world.city выдуманные здания, казну или жителей. Включить городской реестр транзакцией после реального обретения поселения.',
        'Исторический учёт Хейвенгарда — только исходный образец структуры, не факт кампании Рина.',
    ]}
    source['economy']={'always_on_rules':[
        'Деньги персонажа хранятся в целых медных монетах, изменения проводят транзакцией.',
        'Собственность, чужой товар, найденные монеты и оплата за работу учитывать отдельно до решения о принадлежности.',
        'Полная городская экономика подключается только если в каноне появится управляемое поселение; формулы из Хейвенгарда не применять автоматически.',
    ],'lazy_load_when':['Управление городом или поселением','Строительство, рынок, хозяйство, штат, население, городская казна']}
    source['loot_inventory_and_assets']={'rules':[
        'Подтверждённое имущество учитывать в inventory_catalog; реестр владения отделён от временно перевозимого чужого товара.',
        'Не продавать, не передавать и не использовать чужое имущество автоматически.',
        'Количество боеприпасов синхронизировать с ресурсом, если принадлежит персонажу и доступно к использованию.',
        'Сохранить происхождение, состояние, количество и статус каждого важного предмета; расход по подтверждённым событиям.',
    ]}
    source['play_rules']={'note':'Сюжетный контроль игрока над действиями Рина; NPC и события ведёт мастер.'}
    source['priority_order']=[
      'прямое текущее решение игрока','последнее подтверждённое сыгранное событие',
      'state/_campaign-state.json','rules/_campaign-rules.json','мастер-файл Рина (источник сверки, не второе оперативное сохранение)',
      'канонические летописи','мастерские планы (candidate, не канон)','старые черновики'
    ]
    source['source_registry']=[
      {'key':'rin_master_sheet','title':'Рин Вейр — мастер-файл.xlsx','role':'Архивный источник карточки и биографии; оперативные показатели в state/_campaign-state.json', 'load_policy':'При расхождении или миграции новой истории'},
      {'key':'combat_engine','title':'rin_dnd — тактический v29R','repository_path':'index.html','role':'Отдельная сессия боя; игровое состояние только через подтверждённую транзакцию','load_policy':'При переходе в бой'},
      {'key':'spoilers','title':'GM: сюжетная подготовка и секреты','repository_path':'gm/README.md','role':'Публично доступно, явно СПОЙЛЕРЫ; candidate не канон','load_policy':'Только ведущему при подготовке, не сообщать игроку раньше события'},
      {'key':'rules_2024','title':'Player Handbook 2024','role':'Игровые правила D&D 2024','load_policy':'Проверять неясные эффекты'}]
    source['context_policy']['core_rule_refs']=[f'narrative:{i}' for i in range(len(source['narrative']['rules']))]+['canon_policy:0','canon_policy:2','canon_policy:3','canon_policy:5']
    source['context_policy']['mode_sections']={'combat':['combat','mechanics_and_rolls','readiness_and_resources'], 'travel':['travel','world_logic'],'economy':['economy','city_and_population'],'exploration':['world_logic','loot_inventory_and_assets'],'social':['social_and_relationships']}
    source['prompt_audit']={'file':'rules/_prompt-audit.json','status':'ported from Hayvengard; canonical override Rin.'}
    save('rules/_campaign-rules.json',source)
    save('rules/_prompt-audit.json',{'origin':'havengard-campaign-engine/rules/_prompt-audit.json','campaign':'rin-veir','status':'ported and adapted','note':'Source-specific legacy audit is preserved in upstream_campaign/; current Rin rules override it.'})

    # Confirmed inventory plus roadside bandit effects. Distinguish newly recovered stock from personal usable stock.
    inventory={}
    def add(id,name,q,description='',status='при себе',origin='канон кампании'):
       inventory[id]={'name':name,'quantity':q,'description':description,'status':status,'origin':origin}
    add('cherta','«Черта» (короткий меч)',1,'Основное оружие, Vex')
    add('daggers','Кинжалы',4,'Один может применять Nick')
    add('shortbow','Короткий лук',1)
    add('arrows','Стрелы',20,'В рабочем колчане; не смешивать с найденными до перекладки')
    add('quiver','Колчан',1)
    add('thieves_tools','Воровские инструменты',1)
    add('burglars_pack','Набор взломщика',1)
    add('pouches','Поясные сумки',2)
    add('clothes','Дорожная одежда и серое пальто',1)
    add('bedroll','Постельные принадлежности',1)
    add('game_set','Игровой набор',1)
    add('monastery_documents','Документы Последнего Света',1,'Похищены при уходе; часть содержания неизвестна','скрыто при себе')
    add('edric_letter','Письмо Эдрика для Сайрена',1,'Прочитано вместе с Сайреном')
    add('edric_plate','Контактная пластинка Эдрика',1,'Контакт Остен Рей, пароль о книге без последней страницы')
    add('circle_vii','Жетон VII',1)
    add('circle_orders','Записка с приказом Разомкнутого Круга',1)
    add('horse','Верховая лошадь',1,'Оставлена в Сером Броде на конюшне; местоположение подлежит сверке','конюшня Серого Брода')
    add('saddle','Верховое седло',1,'На лошади','конюшня Серого Брода')
    add('saddlebags','Седельные сумки',1,'На лошади','конюшня Серого Брода')
    add('food_wraps','Сухие дорожные свёртки',2,'На лошади','конюшня Серого Брода')
    add('rope','Тонкая верёвка',1,'На лошади','конюшня Серого Брода')
    add('blank_tokens','Жетоны без номера',3,'На лошади','конюшня Серого Брода')
    add('route_map','Карта Серый Брод — Вейлхольм',1,'Отмечена старая обсерватория и «VII — активен»')
    add('circle_notebook','Записная книжка Разомкнутого Круга',1)
    add('sealed_cylinder','Запечатанный металлический цилиндр',1,'Не вскрыт')
    add('unclear_flasks','Флаконы мутной жидкости',3,'2 у Мары; 1 в седельной сумке','частично у Мары')
    add('needle_case','Футляр с тремя иглами',1,'Возможно опасное содержимое','у Мары')
    add('thin_pick','Тонкая металлическая отмычка',1,'Найдена у Лорена','у Мары')
    add('bandit_sabers','Трофейные сабли',3,'С пяти дорожных разбойников','караванная повозка','засада на дороге')
    add('bandit_bows','Трофейные короткие луки',2,'С дорожных разбойников','караванная повозка','засада на дороге')
    add('bandit_armors','Поношенные кожаные доспехи',5,'С дорожных разбойников','караванная повозка','засада на дороге')
    add('bandit_arrows','Трофейные стрелы',32,'Ещё не зачислены в личный колчан','караванная повозка','засада на дороге')
    add('bandit_quivers','Трофейные колчаны',2,'С дорожных разбойников','караванная повозка','засада на дороге')
    add('bandit_pouches','Трофейные кошели',5,'Монеты учтены в личном кошельке','караванная повозка','засада на дороге')

    pid='rin'
    principal = {
      'name':'Рин Вейр','role':'персонаж игрока, путешественник','location':'Лесная дорога, третий фургон каравана',
      'state':'Невредим; вечером после отражённой засады; разговор с Элирой и Оли',
      'goal':'Направиться в Вейлхольм; разобраться с Изнанкой и документами монастыря',
      'resources':{
        'hp':{'current':31,'max':31},'focus':{'current':0,'max':3},
        'arrows':{'current':20,'max':20},'luck':{'current':2,'max':2},
        'heroic':{'current':1,'max':1},'personal_money_cp':18289,
        'unusual_metabolism':{'current':1,'max':1},
      },
      'character_sheet':{'class_and_level':'Разбойник 1 / Монах 3 (Воин Тени), D&D 2024',
        'armor_class':'16','speed':'40 фт','abilities':{'СИЛ':'8 (-1)','ЛОВ':'17 (+3)','ТЕЛ':'14 (+2)','ИНТ':'8 (-1)','МДР':'16 (+3)','ХАР':'10 (+0)'},
        'combat_reference':[
         {'source_row':1,'cells':['«Черта», короткий меч','+5 к попаданию','1к6+3','Vex']},
         {'source_row':2,'cells':['Безоружный удар','+5 к попаданию','1к6+3']},
         {'source_row':3,'cells':['Скрытая атака','1к6 один раз за ход при выполнении условий']},
         {'source_row':4,'cells':['Тьма Воина Тени','1 фокус, действие, 15 фт радиус, 60 фт дальность, концентрация до 10 минут; видит внутри своей Тьмы']},
         {'source_row':5,'cells':['Шквал ударов','1 фокус, две безоружные атаки']},
        ]},
      'inventory':list(inventory), 'inventory_catalog':inventory,
      'source_coverage':{'inventory':{'status':'partial','source_key':'master_sheet_and_roadside_inventory'},'sheet':{'status':'partial','source_key':'rin_veir_master_and_played_scenes'}},
      'relationships':{},
    }
    # NPC records are principals, not party members or puppets for the player.
    npcs={
      'npc:sayren':('Сайрен','Уже направляется отдельно в Вейлхольм; условлена встреча в «Медном колоколе».'),
      'npc:elira':('Элира Венн','19 лет, сестра Оли. Едет в Вейлхольм разбираться с наследством.'),
      'npc:oli':('Оли','7 лет, брат Элиры; напуган засадой, учится справляться со страхом.'),
      'npc:harren':('Харрен Досс','Глава каравана; отвечает за груз и безопасность.'),
      'npc:bran':('Бран','Возница каравана.'),
      'npc:tessan':('Тессан','Разбойник, взят живым; пленник каравана.'),
      'npc:gart':('Гарт','Разбойник, взят живым; ушиблен, способен ходить.'),
      'npc:edric':('Эдрик Маррен','Раненый человек, оставлен под присмотром Мары в Сером Броде.'),
      'npc:mara':('Мара Элден','Лекарка Серого Брода.'),
      'npc:doren':('Дорен Касс','Человек, преследовавший Рина; состоялся разговор.'),
      'npc:corvin':('Корвин Венн','Покойный дядя Элиры, оставил ей наследство в Вейлхольме.'),
      'npc:oswin':('Освин Керр','Имя из подготовки к возможной линии наследства; Рину пока неизвестно.'),
      'npc:tavin':('Тавин','Имя из подготовки к возможной линии наследства; Рину пока неизвестно.'),
      'group:circle':('Разомкнутый Круг','Фракция, связанная с событиями Серого Брода.'),
      'group:monastery':('Монастырь Последнего Света','Орден, воспитавший Рина; причины задания не раскрыты.'),
      'group:caravan':('Караван Харрена','Четыре повозки и охрана; едет в Вейлхольм.'),
    }
    principals={p:{'kind':p.split(':',1)[0],'name':data[0],'description':data[1]} for p,data in npcs.items()}
    fact_defs=[
      ('K001','Рин покинул Монастырь Последнего Света после отказа убить чиновника; забрал документы.',['rin'],'monastery','public'),
      ('K002','Сайрен и Рин исследуют связь документов, Изнанки и Разомкнутого Круга.',['rin','npc:sayren'],'circle','party'),
      ('K003','Эдрик был ранен; Рин передал его на попечение Мары в Сером Броде.',['rin','npc:sayren','npc:edric','npc:mara'],'circle','party'),
      ('K004','Элира и Оли едут в Вейлхольм, где надеются получить дом в наследство от покойного Корвина Венна.',['rin','npc:elira','npc:oli'],'inheritance','party'),
      ('K005','Рин оплатил перевозку Элиры и Оли — 3 золотых.',['rin','npc:elira'],'caravan','party'),
      ('K006','Караван подвергся нападению пяти разбойников; Тессан и Гарт захвачены живыми.',['rin','npc:harren','npc:tessan','npc:gart'],'caravan','party'),
      ('K007','Из лагеря разбойников возвращён чужой товар и деньги 20 зм 9 см 9 мм; вещи везут для поиска владельцев.',['rin','npc:harren'],'caravan','party'),
      ('K008','Сайрен планировал встречу с Рином в трактире «Медный колокол» в Вейлхольме по условленному знаку.',['rin','npc:sayren'],'circle','party'),
      ('K009','Рин объяснил Оли способ справляться со страхом: разрешить себе бояться пять ударов сердца, затем действовать.',['rin','npc:oli','npc:elira'],'caravan','party'),
      ('K010','Элира и Оли остались в повозке во время нападения; Оли выполнил обещание не выходить.',['rin','npc:oli','npc:elira'],'caravan','party'),
      ('K011','На тканях из разбойничьего лагеря есть торговая метка Мартена Лосса; владелец пока не установлен.',['rin','npc:harren'],'caravan','party'),
      ('K012','Два флакона мутной жидкости и футляр с иглами оставлены у Мары; состав не установлен.',['rin','npc:mara'],'circle','party'),
    ]
    knowledge={}
    for key,fact,knowers,branch,visibility in fact_defs:
       knowledge[key]={'fact':fact,'known_by':[k for k in knowers if k=='rin'],'source_event':'RIN-BASELINE-2026-10-16','status':'canonical','temporal_status':'current','visibility':visibility,'branch':branch}
    knowledge['K900']={'fact':'Согласно предварительной подготовке, дом Корвина мог быть занят Освином Керром, а Тавин мог оказаться удерживаемым. Это НЕ установленный сыгранный факт.',
         'known_by':[],'source_event':'GM-PREP-UNPLAYED','status':'candidate','temporal_status':'current','visibility':'gm','hidden_from_party':True,'spoiler':True}
    awareness={}
    for key,fact in knowledge.items():
      if fact['status']=='canonical':
        awareness[key]={k:{'state':'knows','source':fact['source_event']} for k in next((v[2] for v in fact_defs if v[0]==key),[]) if k!='rin'}
    branches={
      'BR-MONASTERY':{'title':'Последний Свет и исчезнувшие мотивы','status':'active','knowledge_ids':['K001'],'key_principals':['rin','group:monastery']},
      'BR-CIRCLE':{'title':'Разомкнутый Круг и Изнанка','status':'active','knowledge_ids':['K002','K003','K008','K012'],'key_principals':['rin','npc:sayren','group:circle']},
      'BR-CARAVAN':{'title':'Засада и дорога в Вейлхольм','status':'active','knowledge_ids':['K005','K006','K007','K009','K010','K011'],'key_principals':['rin','npc:harren','npc:elira','npc:oli']},
      'BR-INHERITANCE':{'title':'Наследство Веннов','status':'active','knowledge_ids':['K004'],'key_principals':['rin','npc:elira','npc:oli','npc:corvin']},
      'BR-GM-ESTATE':{'title':'[СПОЙЛЕРЫ GM] Подготовка линии дома Корвина','status':'dormant','knowledge_ids':['K900'],'key_principals':['npc:oswin','npc:tavin']},
    }
    graph={'schema_version':1,'campaign_id':'rin-veir','graph_revision':1,
       'policy':{'do_not_infer_unseen_information':True,'knowledge_requires_source':True,'relationships_do_not_grant_knowledge':True},
       'principals':principals,'branches':branches,'awareness':awareness}
    threads={
      'T001':{'title':'Последний Свет и приказ','status':'active','summary':'Скрытые мотивы порученного убийства и найденные документы.','pressure':'не установлен','visibility':'party'},
      'T002':{'title':'Изнанка и Разомкнутый Круг','status':'active','summary':'Контакты Эдрика, сведения о Седьмом пороге, встреча с Сайреном.','pressure':'не установлен','visibility':'party'},
      'T003':{'title':'Наследство Элиры Венн','status':'active','summary':'В Вейлхольме ищут наследный дом и правоустанавливающие документы.','pressure':'не установлен','visibility':'party'},
      'T004':{'title':'Разбойники и возврат имущества','status':'active','summary':'Доставить Тессана и Гарта и товары в город, установить владельцев.','pressure':'на дороге задерживаться нежелательно','visibility':'party'},
    }
    relationships={
      'REL-RIN-ELIRA':{'participants':['rin','npc:elira'],'status':'active','visibility':'party','kind':'acquaintance',
        'label':'Рин — Элира','formal_status':'Попутчики','emotional_stage':'Взаимная благодарность после защиты каравана','pace':'естественный','dynamics':['забота об Оли'],
        'player_summary':'Рин оплатил дорогу Элиры и Оли, защитил караван и поддержал мальчика. Не навязывать романтическую линию.',
        'directional':{'npc:elira':{'summary':'Благодарна Рину за помощь брату и безопасную дорогу.'}},'evidence':['K004','K005','K010']},
      'REL-RIN-OLI':{'participants':['rin','npc:oli'],'status':'active','visibility':'party','kind':'friendship','label':'Рин — Оли',
        'formal_status':'Старший защитник и юный попутчик','emotional_stage':'Оли доверяет Рину','pace':'формируется',
        'dynamics':['учится справляться со страхом'],'player_summary':'Оли считает Рина примером и попросил рассказать секрет против страха.',
        'directional':{'npc:oli':{'summary':'Восхищается умением Рина защищать других.'}},'evidence':['K009','K010']},
      'REL-RIN-SAYREN':{'participants':['rin','npc:sayren'],'status':'active','visibility':'party','kind':'alliance','label':'Рин — Сайрен',
        'formal_status':'Осторожное сотрудничество','emotional_stage':'Формирующееся доверие','pace':'медленно',
        'dynamics':['общее расследование'],'player_summary':'Договорились разделиться по пути в Вейлхольм, встретиться в «Медном колоколе».',
        'directional':{},'evidence':['K002','K008']},
    }
    money_held=20*100+9*10+9
    state={
      'schema_version':2,'state_revision':1,'campaign':{'id':'rin-veir','title':'Рин Вейр'},
      'party':{'members':['rin'],'location':'Лесная дорога к Вейлхольму'},'characters':{'rin':principal},
      'world':{'current_region':'Тракт между Серым Бродом и Вейлхольмом',
        'current_scene':'Третья повозка каравана. Рин беседует с Элирой и Оли после засады, вечер второго дня пути.',
        'date_label':'Вечер второго дня пути (календарная дата мира не установлена)',
        'time_label':'Поздний вечер после засады',
        'timekeeping':{'anchor_event':'RIN-CARAVAN-AFTER-AMBUSH-BASELINE','anchor_label':'Сцена у третьей повозки после засады','elapsed_seconds_from_anchor':0,'elapsed_hours_from_anchor':0,'elapsed_full_days_from_anchor':0,'policy':'Время от этой сцены; прошлые дни не домысливать. Только advance_time.'},
        'scene_participants':['rin','npc:elira','npc:oli','npc:bran','npc:harren'],
        'scene_knowledge_branches':['BR-CARAVAN','BR-INHERITANCE'],
        'scene_knowledge_notice':'Секреты GM доступны в репозитории с маркировкой [СПОЙЛЕРЫ], но не знания Рина.',
        'travel_event':{'kind':'ambush_resolved','status':'resolved','destination':'Вейлхольм','caravan_wagons':4,
             'captives':['npc:tessan','npc:gart'],'recovered_goods':'pending_owner_identification'},
      },
      'knowledge':knowledge,'knowledge_graph':graph,'beliefs':{},'threads':threads,'world_pressures':{},'relationships':relationships,
      'loot_bundles':{'caravan_stolen_property':{'owner':'unknown','status':'custody_pending_restitution','currency_cp':money_held,
        'items':['2 рулона льна','крашеная шерсть','набор портного','серебряная брошь-лист с синей лентой','сумка с торговым гербом','счёт Мартену Лоссу','флаконы ароматических масел','плотницкий инструмент','2 тетивы','14 стрел','провизия и походные вещи'],
        'notes':'Не личная добыча Рина. Везут в Вейлхольм для возвращения владельцам.'}},
      'scene_context':{'mode':'social','thread_ids':['T003','T004'],'fact_ids':['K004','K006','K009','K010'],
        'resource_keys':{'rin':['hp','focus','personal_money_cp']},
        'handoff':{'last_player_input':'Когда чувствуешь, что тебя окутывает страх, не борись с ним. Скажи себе - разрешаю бояться ровно пять ударов сердца. Отсчитываешь. Потом всё. Ты взял его под контроль.',
           'last_narrative_excerpt':'— Рин, а тебя кто научил этому секрету? Или ты сам придумал?',
           'open_question':'Оли спросил Рина, кто научил его этому приёму против страха. Игрок ещё не ответил. Не решать за Рина.',
           'player_intent':None,
           'source':'Текущая кампания Рина, разговор с Оли и Элирой после засады, 2026-10-16',
           'source_note':'Сайрен едет отдельно; Эдрик остался у Мары. Новые товары разбойников не принадлежат Рину. События после этой сцены не сыграны.'}},
      'recent_events':[
         {'id':'RIN-ORIGIN','summary':'Рин ушёл из Монастыря Последнего Света после отказа выполнить приказ об убийстве, сохранил документы.','visibility':'party'},
         {'id':'RIN-GREY-FORD','summary':'В Сером Броде встретил Сайрена; помог раненому Эдрику, оставил его у Мары; получил контакты и сведения об Изнанке.','visibility':'party'},
         {'id':'RIN-DEPARTURE','summary':'Рин едет с караваном Харрена в Вейлхольм. Оплатил проезд Элиры и Оли.','visibility':'party'},
         {'id':'RIN-AMBUSH','summary':'Пятеро разбойников атаковали караван. Два пленника Тессан и Гарт захвачены живыми. Отдельно учтён возврат предполагаемо украденного имущества и трофейного снаряжения.','visibility':'party'},
         {'id':'RIN-OLI-FEAR','summary':'Рин похвалил Оли за защиту сестры и объяснил способ выдержать пять ударов сердца во время страха. Оли спросил, кто научил Рина.','visibility':'party'},
      ],
      'play_rules':{'narrative_control':{'rin_controlled_by_player':True,'player_words_are_woven_into_first_person_narrative':True,'do_not_invent_rin_decisions':True},
          'combat_control':{'party_controlled_by_player':['rin'],'gm_controls':['enemies','environment','npc_reactions','consequences'],
              'stop_before_each_player_character_turn':True,'optional_reactions_require_player_choice':True},
          'loot_policy':{'retain_consumables':True,'do_not_auto_claim_recovered_stolen_goods':True}},
      'applied_events':{'RIN-BASELINE-2026-10-16':{'revision':1,'source':'played scenes + Rin master sheet','kind':'initialization'}},
      'commit_history':[{'revision':1,'event_id':'RIN-BASELINE-2026-10-16','summary':'Инициализация состояния кампании Рина на основании сыгранного.'}],
      'event_unique_keys':{},
    }
    save('state/_campaign-state.json',state)
    save('state/_knowledge-graph.json',graph)
    return state

if __name__=='__main__':
  import sys
  if (ROOT/'state/_campaign-state.json').exists() and '--force-baseline' not in sys.argv:
    raise SystemExit('Campaign already initialized. Refusing to overwrite current saved game. --force-baseline required for a disposable sandbox only.')
  result=build();print('Rin state generated',result['state_revision'],len(result['characters']['rin']['inventory']))
