# Встроенные шрифты

Все файлы взяты из открытых проектов и переданы как есть, без изменений. Каждый содержит полный набор
азербайджанских букв (Ə ə Ğ ğ İ ı Ş ş Ç ç Ö ö Ü ü): `test/fonts.test.js` проверяет это по таблице символов.
Статические TTF получены из npm-пакетов `@expo-google-fonts/*` (упаковка Google Fonts; сама упаковка под MIT, шрифты под лицензиями ниже).

Лицензия SIL Open Font License 1.1 приложена целиком: [OFL-1.1.txt](OFL-1.1.txt). Roboto Slab распространяется
под Apache License 2.0: [RobotoSlab/LICENSE-Apache-2.0.txt](RobotoSlab/LICENSE-Apache-2.0.txt).

| Семейство | Файлы | Авторские права (из таблицы name файла) | Лицензия |
|---|---|---|---|
| Inter | 400, 500, 600, 700, 800, 900 | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | OFL 1.1 |
| Inter Tight | 800 | Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight) | OFL 1.1 |
| Montserrat | 700, 800, 900 | Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat) | OFL 1.1 |
| Oswald | 500, 600, 700 | Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont) | OFL 1.1 |
| Source Serif 4 | 600, 700, 600 italic, 700 italic | (c) 2014-2021 Adobe Systems Incorporated (http://www.adobe.com/), Reserved Font Name 'Source' | OFL 1.1 |
| Playfair Display | 700, 800 | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), Reserved Font Name "Playfair Display" | OFL 1.1 |
| Fira Sans | 500, 700 | Digitized data copyright 2012-2016, The Mozilla Foundation and Telefonica S.A. | OFL 1.1 |
| Roboto Slab | 700, 800 | Copyright 2018 The Roboto Slab Project Authors (https://github.com/googlefonts/robotoslab) | Apache 2.0 |
| IBM Plex Mono | 500, 600, 700 | Copyright 2017 IBM Corp. All rights reserved. | OFL 1.1 |
| Space Mono | 700 | Copyright 2016 The Space Mono Project Authors (https://github.com/googlefonts/spacemono) | OFL 1.1 |
| Caveat | 700 | Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat) | OFL 1.1 |
| Comfortaa | 700 | Copyright 2011 The Comfortaa Project Authors (https://github.com/alexeiva/comfortaa), Reserved Font Name "Comfortaa" | OFL 1.1 |

Реестр ролей (какая роль какой шрифт использует и с каким коэффициентом размера) — в `src/render/fonts.js`.
