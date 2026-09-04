AUFWIND – GOOD NEWS AUS ALLER WELT
=================================


BUILD 96 – KOMPAKTER ERSTSTART MIT EINSTELLUNGEN
------------------------------------------------
- Das Erststart-Onboarding besteht jetzt aus zwei einfachen Seiten ohne Scrollzwang: zuerst der vollständige „Über Aufwind“-Text, danach eine kompakte Grundeinstellung.
- Darstellung wird als Zweipunkt-Regler „Hell ↔ Dunkel“ gewählt.
- Textgröße wird als Dreipunkt-Regler „Klein – Mittel – Groß“ gewählt.
- Datensparmodus, anonyme Nutzungsstatistik und Push-Benachrichtigungen werden jeweils nur als „Aus/An“-Schalter gezeigt.
- Push-Zeiten und Kategorien bleiben bewusst aus dem Erststart heraus und werden später in den normalen Einstellungen gewählt.
- Die Auswahl wird beim Tippen auf „Los geht's“ in die bestehenden Aufwind-Einstellungen übernommen; Push fragt nur bei aktivierter Auswahl nach der Systemberechtigung.
- Anonyme Browser-Besucher bekommen kein Onboarding. Es erscheint einmal beim ersten Start der installierten App/PWA oder nach einer neuen Registrierung auf diesem Gerät.


BUILD 95 – WILLKOMMEN PRO APP-INSTALLATION
------------------------------------------
- Der Willkommensbildschirm ist nicht mehr an Registrierung oder Benutzerkonto gekoppelt.
- Browser-Besucher sehen Aufwind ohne vorgeschalteten Willkommensbildschirm.
- Eine installierte PWA/App zeigt „Herzlich willkommen bei Aufwind“ genau einmal beim ersten Start der jeweiligen Installation.
- „Los geht's“ speichert den Abschluss ausschließlich lokal auf dem Gerät; Registrierung und spätere Logins lösen keine weitere Begrüßung aus.
- Die Logik ist bereits für eine spätere Play-Store-/Standalone-App vorbereitet.


BUILD 93 – REDUZIERTER WILLKOMMENSBILDSCHIRM
---------------------------------------------
- Nach der ersten Anmeldung eines neu registrierten Kontos erscheint nur noch die Begrüßung mit dem vollständigen Aufwind-Text.
- Die zusätzliche Überschrift „Über Aufwind“, der Untertitel und die Nutzungsstatistik wurden aus dem Willkommensbildschirm entfernt.
- Die freiwillige Nutzungsstatistik bleibt standardmäßig aus und kann später ausschließlich in den Einstellungen geändert werden.

BUILD 90 – WILLKOMMEN NACH REGISTRIERUNG
---------------------------------------
- Der bisherige Erststart-Dialog für „Über Aufwind“/Nutzungsstatistik wurde durch einen kompakten Willkommensbildschirm ersetzt.
- Er erscheint nur nach der ersten Anmeldung eines neu registrierten Kontos.
- Drei aufklappbare Bereiche: „Über Aufwind“, „So funktioniert Aufwind“ und „Nutzungsstatistik“; immer nur ein Bereich ist gleichzeitig geöffnet.
- Die Seite ist auf eine Bildschirmhöhe ausgelegt und benötigt im normalen mobilen Layout kein Scrollen.
- Die Nutzungsstatistik bleibt ohne ausdrückliche Zustimmung ausgeschaltet und kann später in den Einstellungen geändert werden.
- Interne Hinweise zu Redaktionskonten wurden aus den nutzerseitigen Datenschutz-/Einwilligungstexten entfernt.

BUILD 85 – UX-/REDAKTIONSRUNDE
-----------------------------
- App-Update steht in den Nutzereinstellungen ganz oben.
- Nutzungsstatistik-Text wurde gekürzt.
- Lesereinsendungen enthalten kein Ortsfeld mehr.
- Das Auge ist die erste Aktion unter dem Plus-Menü.
- Such-Kategorien filtern nur noch die Suchergebnisse und nicht mehr den Hauptfeed.
- Fehlermeldungen besitzen einen sichtbaren Status und zuverlässiges Feedback für „Erledigt“/„Verwerfen“.
- Offene ChatGPT-Vorschläge, Einsendungen und Fehlermeldungen werden mit deutlichen Zähler-Badges angezeigt; die Oberpunkte Beiträge/Einstellungen zeigen Summen.
- Neue ChatGPT-Entwürfe, Lesereinsendungen und Fehlermeldungen lösen serverseitig einen Admin-Push aus.
- Beitragseditor: Priorität → Status → geplante Veröffentlichung → Kategorie; Quellen stehen direkt unter dem Kurztext.
- Dunkle Menüs haben jetzt deutlich getrennte Hintergrund- und Buttonflächen.

Stand dieses Pakets: Build 101

Aufwind ist eine installierbare Web-App/PWA für positive, redaktionell geprüfte Nachrichten. Die Leseransicht ist mobil und slide-basiert; Redaktion, Nutzerkonten, Push-Funktionen und App-Einstellungen sind über Supabase angebunden.

WICHTIGSTE FUNKTIONEN
---------------------
- Vollbild-News-Feed mit Swipe-Navigation
- Kategorien, Topmeldungen und historische Meldungen „Was war...“
- Die acht Rubriken sind: Kultur & Unterhaltung, Natur & Tiere, Rund um die Welt, Wirtschaft & Politik, Was war..., Sport, Medizin & Technologie und Wissenschaft.
- mehrere Textquellen und getrennte Bildquellen
- Symbolbild-Kennzeichnung
- Suche mit Treffer-Hervorhebung
- Archiv und „Meine Favoriten“
- Teilen und Fehler melden
- freiwillige Nachrichteneinsendungen durch Leser
- Nutzerkonten, Passwort-Reset, Passwortänderung und DSGVO-Selbstauskunft
- freiwillige Push-Benachrichtigungen nach Zeiten und Kategorien
- freiwillige, einwilligungsbasierte Nutzungsstatistik
- Redaktionsbereich mit Entwürfen, Planung, Vorschau, Veröffentlichung und Admin-Rechten
- bearbeitbare App-, „Über Aufwind“- und rechtliche Einstellungen
- Bild-Upload in Supabase Storage
- Wikimedia-Commons-Linkauflösung
- Pexels-Bildsuche für die Redaktion
- PWA-Updateprüfung und synchronisierte Buildnummer
- ruhiger 30-Sekunden-Feedabgleich: nur echte Nachrichtenänderungen lösen ein Neurendern aus

PROJEKTSTRUKTUR
---------------
index.html             Oberfläche und Dialoge
style.css              Design
app.js                 App- und Redaktionslogik
config.js              öffentliche Supabase-Verbindung; niemals Secret/Service-Role-Key eintragen
SUPABASE_SETUP.sql     Grundschema für ein neues Supabase-Projekt
manifest.json          PWA-Metadaten
sw.js                  Service Worker, Offline-/Updateverhalten
version.json           veröffentlichte Buildnummer
package.json           lokale Hilfsbefehle für die Buildnummer
tools/bump-build.mjs   synchronisiert alle Buildstellen automatisch

SUPABASE
--------
Die produktive App verwendet Supabase für Datenbank, Auth, Storage und Edge Functions. In allen öffentlich erreichbaren Tabellen muss RLS aktiviert bleiben. Adminrechte werden über die Tabelle user_roles vergeben; ein normales angemeldetes Konto erhält dadurch nicht automatisch Redaktionszugriff.

Für eine komplett neue Installation:
1. Supabase-Projekt anlegen.
2. SUPABASE_SETUP.sql im SQL Editor prüfen und ausführen.
3. Project URL und Publishable Key bzw. kompatiblen anon key in config.js eintragen.
4. Niemals service_role-, Secret- oder sonstige private Schlüssel in config.js oder andere öffentliche Dateien schreiben.
5. Benötigte Edge Functions im produktiven Supabase-Projekt bereitstellen (u. a. Pexels-Suche, Push, Datenschutzfunktionen).

Bei einem bestehenden produktiven Projekt SUPABASE_SETUP.sql nicht blind erneut ausführen. Schemaänderungen gezielt prüfen bzw. über Migrationen einspielen.

PASSWORTSICHERHEIT
------------------
Aufwind verlangt mindestens:
- 8 Zeichen
- einen Großbuchstaben
- einen Kleinbuchstaben
- eine Zahl
- ein Sonderzeichen

Zusätzlich prüft die App neue bzw. geänderte Passwörter gegen „Pwned Passwords“ von Have I Been Pwned. Das Passwort wird lokal im Browser per SHA-1 gehasht; übertragen werden nur die ersten fünf Hash-Zeichen (k-Anonymität). Das Klartextpasswort und der vollständige Hash verlassen das Gerät nicht. Ist der Prüfdienst vorübergehend nicht erreichbar, wird die lokale Passwortregel weiterhin erzwungen.

Supabases eigener Schalter „Leaked Password Protection“ ist auf kostenpflichtigen Plänen verfügbar. Im aktuell genutzten Free-Plan ersetzt die oben beschriebene kostenlose Prüfung diese Funktion auf App-Ebene; der Supabase Security Advisor kann den kostenpflichtigen Schalter deshalb weiterhin als deaktiviert anzeigen.

PEXELS-BILDSUCHE
----------------
Die Redaktion kann im Beitragseditor bevorzugt nach Pexels-Fotos im Hochformat suchen. Bei Auswahl werden automatisch übernommen:
- Bild-URL
- Pexels-Seitenlink als Bildquelle
- Fotograf / Pexels als Bildnachweis
- Pexels-Lizenz als Lizenzangabe
- Symbolbild-Kennzeichnung (kann anschließend manuell geändert werden)

Die Pexels-API verlangt einen API-Key. Dieser darf nicht im öffentlichen Frontend gespeichert werden. Deshalb läuft die Suche über die geschützte Supabase Edge Function:

  pexels-search

Einmalige Einrichtung im Supabase Dashboard:
1. Bei Pexels einen API-Key erzeugen.
2. Supabase → Edge Functions → Secrets öffnen.
3. Secret mit dem Namen PEXELS_API_KEY und dem Pexels-Key als Wert speichern.
4. Kein erneutes Deployment der Function ist danach nötig.

Fehlt der Key, bietet der Editor automatisch eine normale Pexels-Websuche als Fallback an. Die Function selbst ist nur mit gültigem Login aufrufbar und prüft zusätzlich die Adminrolle.

Pexels verlangt bei API-Nutzung einen sichtbaren Link zu Pexels und empfiehlt die Nennung des Fotografen. Beides ist in der Redaktionsauswahl bzw. den übernommenen Bildangaben vorgesehen.

BILDER UND RECHTE
-----------------
Nur Bilder verwenden, für die die nötigen Nutzungsrechte bestehen. Bildquelle, Urheber/Bildnachweis und Lizenz möglichst vollständig pflegen. Generische Motivbilder, die nicht das konkrete Nachrichtenereignis zeigen, als „Symbolbild“ markieren.

Für Pexels-Fotos gelten die jeweils aktuellen Pexels-Nutzungsbedingungen. Für Wikimedia- oder andere Quellen gelten deren jeweilige Lizenzbedingungen.

BUILDNUMMER UND UPDATE
----------------------
Die Buildnummer wird nicht mehr an mehreren Stellen von Hand geändert.

Voraussetzung: Node.js.

Nächsten Build erzeugen:
  npm run build:next

Synchronität prüfen:
  npm run build:check

Der Befehl aktualisiert automatisch:
- version.json
- AUFWIND_BUILD in app.js
- AUFWIND_SW_BUILD in sw.js
- sichtbare Buildanzeige in index.html
- Cache-Buster von style.css, app.js und manifest.json in index.html und sw.js

Vor jedem neuen veröffentlichten Paket einmal „npm run build:next“ ausführen und danach „npm run build:check“.

DEPLOYMENT AUF GITHUB PAGES
---------------------------
Alle Dateien aus dem Projektstamm einschließlich tools/ und package.json im Repository behalten. Für die eigentliche statische GitHub-Pages-Auslieferung werden index.html, CSS, JavaScript, Manifest und Assets verwendet. Serverseitige Edge Functions bleiben im Supabase-Projekt und enthalten keine Geheimnisse im öffentlichen GitHub-Repository.

Nach einem Deployment kann in Aufwind unter Einstellungen → „Nach Update suchen“ geprüft werden, ob der neue Build erreichbar ist.

MINDESTTEST VOR EINEM RELEASE
-----------------------------
1. Startseite/Feed öffnen und mehrere Slides wischen.
2. Suche, Archiv, Favoriten, Teilen und Fehler melden prüfen.
3. Registrierung, Login, Passwortänderung und Passwort-Reset testen.
4. Redaktion öffnen und einen Entwurf speichern/bearbeiten.
5. Pexels-Suche bzw. deren Fallback testen und Bildnachweise kontrollieren.
6. geplante und sofortige Veröffentlichung prüfen.
7. Push-Einstellungen und – sofern gewünscht – Test-Push prüfen.
8. Impressum, Datenschutz, „Über Aufwind“ und DSGVO-Selbstauskunft öffnen.
9. PWA installieren/aktualisieren und Buildnummer kontrollieren.
10. Supabase Security- und Performance-Advisor nach Schemaänderungen erneut prüfen.
