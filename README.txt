GOOD NEWS 1.0
================

Enthalten:
- Vollbild-Swipe-Feed
- Bilder
- Kategorien
- Topmeldungen
- mehrere Quellen
- Kurz-erklärt/Kontext
- Teilen
- Favoriten lokal auf dem Gerät
- Suche
- Archiv
- zusammengehörige Meldungen / "Was bisher geschah"
- Redaktionslogin
- Dashboard
- Entwürfe
- Vorschau
- Veröffentlichen
- Bearbeiten
- Löschen
- Bild-Upload über Supabase Storage
- kostenlose PWA, geeignet für GitHub Pages

EINRICHTUNG
-----------

1. Supabase-Projekt erstellen.
2. Supabase → SQL Editor → Inhalt von SUPABASE_SETUP.sql komplett ausführen.
3. Supabase → Authentication → einen eigenen Benutzer mit E-Mail + Passwort anlegen.
4. Danach öffentliche Registrierungen/Signups deaktivieren.
   Hintergrund: Jeder authentifizierte Benutzer dieses Projekts darf redaktionell arbeiten.
5. Supabase → Project Settings / API:
   - Project URL kopieren
   - Publishable Key bzw. anon key kopieren
6. config.js öffnen und die beiden Platzhalter ersetzen.
   NIEMALS einen service_role/secret key in config.js eintragen.
7. Alle Dateien dieses Ordners in dein GitHub-Repository hochladen.
8. GitHub Pages aktivieren bzw. bestehende Pages-Seite aktualisieren.
9. App öffnen → ⚙ → mit deinem Supabase-Konto anmelden.

BILDER
------
Bilder werden in den öffentlichen Bucket "news-images" hochgeladen.
Bitte nur Bilder verwenden, für die du die nötigen Nutzungsrechte besitzt, und Bildnachweise angeben.

QUELLEN
-------
Pro Beitrag ist mindestens eine Quelle vorgesehen.
Bei Veröffentlichungen fremde Artikel nicht einfach kopieren, sondern eigene Zusammenfassungen verfassen.

INSTALLATION AUF ANDROID
------------------------
App über die GitHub-Pages-Adresse in Chrome öffnen → Menü → "App installieren"
oder "Zum Startbildschirm hinzufügen".

WICHTIGE DATEIEN
----------------
index.html           Oberfläche
style.css            Design
app.js               App-Logik
config.js            Supabase-Verbindung
SUPABASE_SETUP.sql   Datenbank + Rechte + Bildspeicher
manifest.json        PWA-Einstellungen
sw.js                Offline-/Cache-Grundlage


NEU IN VERSION 1.1 – DESIGN & APP
---------------------------------
Im Redaktionsbereich gibt es jetzt den Tab "Design & App".

Dort kannst du ohne Code ändern:
- App-Name
- Logo
- Hintergrundfarbe
- Textfarbe
- Akzentfarbe
- Überschriftengröße
- runde/eckige Darstellung
- Bildmodus: Vollbild / Bild oben / Bilder aus
- Stärke der Bildabdunklung
- Kategorie ein-/ausblenden
- Datum ein-/ausblenden
- Quellen ein-/ausblenden
- Slide-Zähler ein-/ausblenden

Die Einstellungen werden zentral in Supabase gespeichert und gelten danach für alle Leser.


GOOD NEWS 3.0 – ENTWÜRFE - DREIER
----------------------------------
Neu in der Redaktion: „Entwürfe - Dreier“. Automatisch eingehende Dreier werden dort nur als Vorschläge gespeichert. Mit „Als 3 Entwürfe übernehmen“ entstehen drei redaktionelle Beiträge mit Status ENTWURF. Es erfolgt keine automatische Veröffentlichung.

WICHTIG: Nach dem Update den neuen Abschnitt aus SUPABASE_SETUP.sql im Supabase SQL Editor ausführen, damit die Tabelle triple_drafts existiert.

BUILD 36 – UPDATE-SUCHE
- Update-Suche wartet jetzt auf die Aktivierung des neuen Service Workers und lädt erst danach neu.
- version.json liefert die aktuelle Build-Nummer cachefrei.
- Cache-Buster verhindert, dass nach dem Neustart nochmals die alte index.html erscheint.
- Service-Worker-Installation blockiert nicht mehr am Vorladen aller Dateien; dadurch funktioniert auch der Wechsel von Build 35 schneller.

BUILD 35 – MOBILE NEWS-SLIDES
-----------------------------
- Referenzansicht im Displaytest: 360 × 640 (auf dem verwendeten Testgerät etwa 77 % Vorschaugröße)
- Lange Überschriften werden automatisch verkleinert, damit sie möglichst auf höchstens vier Zeilen bleiben
- Stärkerer dunkler Verlauf hinter dem unteren Textbereich für bessere Lesbarkeit auf hellen Bildern
- PWA-Cache auf Build 35 angehoben

BUILD 42 – DATENSCHUTZ-SELBSTAUSKUNFT
-------------------------------------
- Angemeldete Nutzer: Konto → „Meine Daten“ → Daten anzeigen / JSON herunterladen.
- Angemeldete Nutzer können ihr Konto und direkt verknüpfte Serverdaten selbst löschen.
- Redaktion: neuer Menüpunkt „DSGVO-Auskunft“ mit gezielter Suche nach Konto-E-Mail und JSON-Export.
- Die dafür verwendete Supabase Edge Function `good-news-privacy` ist im verbundenen Supabase-Projekt deployed und verlangt ein gültiges Login; Admin-Suchen werden serverseitig zusätzlich auf die Adminrolle geprüft.
- Lokale Favoriten/Einstellungen werden beim Selbsexport auf dem jeweiligen Gerät ergänzt; anonyme Statistikdaten sind absichtlich nicht mit dem Konto verknüpft.

BUILD 43
- Nutzer-Einstellungen werden erst mit dem neuen Speichern-Button vollständig übernommen.
- Push-Zeiten und Kategorien sind während der Bearbeitung frei auswählbar und werden pro Push-Abo gespeichert.
- Nicht gespeicherte Änderungen werden beim Schließen, Tabwechsel und Seitenverlassen abgefragt.
- Redaktionelle App-Einstellungen und Beitragseditor nutzen denselben Verlassensschutz.
- Nach erfolgreichem Speichern erscheint kurz „Gespeichert.“.
- Supabase-Push-Abos unterstützen notify_morning, notify_evening und notify_categories.


BUILD 44
- Push-Abos erhalten eine zufällige Installationskennung (device_key).
- Mehrere alte Push-Endpunkte derselben Installation werden beim Speichern bereinigt.
- Der Versand kann pro Installation entdoppeln, ohne andere Geräte desselben Kontos zu verlieren.


BUILD 49 – RELOAD-SCHLEIFE BEHOBEN
- Buildnummern in App, Service Worker, UI und version.json sind wieder identisch.
- Verhindert die wiederholte automatische Update-Navigation, die sich wie ein Seiten-Refresh alle paar Sekunden auswirkte.
- Zusätzliche 30-Sekunden-Sicherheitsbremse verhindert Reload-Schleifen bei einem unvollständigen Deployment.

Build 51
- Rechter Feed-Bereich zeigt nur noch das allgemeine Menü und direkt darunter das Auge.
- Das zusätzliche Drei-Punkte-Meldungsmenü wurde entfernt.
- Aktionen für die aktuelle Meldung (merken/aus Favoriten entfernen, teilen, Fehler melden) liegen jetzt im allgemeinen Menü.
