# Île-de-France Mobilités

Diese Integration verfolgt **den öffentlichen Nahverkehr im Großraum Paris in Echtzeit** in Gladys: die nächsten Abfahrten an deinen Haltestellen — **RER, Transilien, Metro, Tram, Bus** — mit ihren **Verspätungen** und **Ausfällen**, und den **Verkehr** deiner Linien (Störungen, Bauarbeiten). Daraus macht sie Geräte, Szenen-Auslöser („mein RER fällt aus“, „meine Metro fährt in 5 Minuten“, „Linie 13 ist gestört“) und Dashboard-Widgets.

Die Daten stammen von **PRIM**, der Open-Data-Plattform von Île-de-France Mobilités, und aus ihren offenen Referenzdaten (Linien und Haltestellen).

> Community-Integration, nicht verbunden mit Île-de-France Mobilités, SNCF oder RATP.

## Konfiguration

### 1. Einen API-Schlüssel holen (kostenlos)

1. Erstelle ein Konto auf [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr).
2. Öffne im Menü deines Kontos **Mes jetons d'authentification** (meine Authentifizierungs-Token), Tab **API**, und klicke auf **Générer mon jeton**.
3. Kopiere das Token sofort: Es wird **nur einmal angezeigt** (ein neues zu erzeugen macht das alte ungültig).

Ein neues Konto erlaubt **1 000 Anfragen pro Tag und API**: genug für ein oder zwei Haltestellen mit Zeitfenster. Für mehr beantragst du auf der Seite [Ma consommation API](https://prim.iledefrance-mobilites.fr/fr/ma-consommation-api) kostenlos ein höheres Kontingent (bis zu 1 000 000 pro Tag für die Abfahrten) und trägst es dann in der Einstellung **Tageskontingent der Abfahrten** ein.

### 2. Die verfolgten Haltestellen (bis zu 3)

| Feld            | Rolle                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Haltestelle** | der Name der Haltestelle („Massy - Palaiseau“, „Châtelet“) oder ihre Nummer aus **Haltestelle suchen** |
| **Linie**       | optional, aber empfohlen: „RER B“, „Transilien P“, „Métro 13“, „T3a“, „Bus 91“, „C01743“               |
| **Richtung**    | optional: Wörter des Ziels („Robinson“, „Saint-Rémy \| Massy“ für zwei Richtungen)                     |
| **Zeitfenster** | optional, z. B. `07:00-09:30`                                                                          |
| **Reisetage**   | optional, z. B. Montag bis Freitag (leer: jeden Tag)                                                   |

Bei einer Linie ohne Verkehrsmittel ist ein Buchstabe eine Zuglinie („B“ = RER B, „P“ = Transilien P) und eine Zahl eine Metrolinie vor einer Buslinie („13“ = Metro 13). Für einen Bus schreibe „Bus 91“; haben mehrere Netze eine Linie mit dieser Nummer, nutze die Kennung aus **Linie suchen** („C01122“).

Mit einer Linie wird der Haltestellenname **unter den Haltestellen dieser Linie** gesucht: am zuverlässigsten. Ohne Linie nimmt die Integration die Haltestelle, deren Name genau passt, Bahnhöfe zuerst, und zeigt **alle** ihre Linien. Ist es nicht die richtige Haltestelle, nutze **Haltestelle suchen** und kopiere ihre Nummer.

#### Das Zeitfenster

Die nächsten Abfahrten sind nur **zwei Stunden im Voraus** bekannt. Mit einem Zeitfenster wird die Haltestelle nur ab einer Stunde vor dem Fenster bis zu seinem Ende gelesen, und den Rest der Zeit **gar nicht**. Das spart viel Kontingent: Eine Haltestelle mit einem 2-stündigen Zeitfenster an Werktagen kostet etwa 65 Anfragen pro Tag, eine ganztägig gelesene etwa 600.

Bräuchten die eingerichteten Haltestellen mehr als das Kontingent, **verteilt die Integration die Abfragen selbst** (die Schaltfläche **Verbindung testen** zeigt das tatsächlich verwendete Intervall).

### 3. Der Verkehr

Gib unter **Verfolgte Linien** bis zu 6 Linien durch Kommas getrennt ein: `RER B, Transilien P, Métro 13`. Das ganze Netz wird mit **einer einzigen Anfrage** alle 5 Minuten gelesen (einstellbar), etwa 290 Anfragen pro Tag, unabhängig von der Zahl der Linien.

Eine Linie ist:

- **unterbrochen**, wenn eine unterbrechende Störung gilt (kein Zug auf der ganzen Linie oder einem Teil davon);
- **gestört**, wenn eine Störung gilt, ohne den Verkehr zu unterbrechen (Verlangsamungen, ausgelassene Halte …);
- **normal** sonst. Reine Informationsmeldungen (ein defekter Aufzug …) zählen nicht.

Speichere und klicke dann auf **Verbindung testen**: Für jede Haltestelle zeigt es die gefundenen Abfahrten und die nächste, den Zustand jeder Linie und das verbrauchte Kontingent.

### 4. Die Geräte hinzufügen

Im Tab **Entdecken** erscheint jede Haltestelle als „IDFM – _Haltestelle_ (_Linie_ → _Richtung_)“ und jede verfolgte Linie als „IDFM – Verkehr _Linie_“. Füge sie hinzu und ordne sie einem Raum zu.

| Gerät       | Funktion               | Wert                                                                            |
| ----------- | ---------------------- | ------------------------------------------------------------------------------- |
| Haltestelle | **Nächste Abfahrt**    | Text, z. B. „07:42 · RER B KASE → Aéroport CDG 2 · +5 min“                      |
| Haltestelle | **Abfahrt in**         | Minuten, Echtzeit                                                               |
| Haltestelle | **Verspätung**         | Minuten (Züge mit Fahrplan; bei der Metro, die keinen hat, immer 0)             |
| Haltestelle | **Gestörte Abfahrten** | wie viele verfolgte Abfahrten verspätet (ab der Schwelle) oder ausgefallen sind |
| Linie       | **Verkehr**            | Text: „Normaler Verkehr“, „Gestört: …“, „Unterbrochen: …“                       |
| Linie       | **Aktuelle Störungen** | die jetzt geltenden Störungen (Informationsmeldungen ausgenommen)               |

Die Gerätenamen und die Szenen-Zusammenfassungen folgen der Einstellung **Sprache der Texte**: Englisch, Französisch, Deutsch, Spanisch oder automatisch (die Sprache deines Dashboards, sobald ein IDFM-Widget angezeigt wurde).

Auf dem Bildschirm **Geräte** zeigt das Badge jeder Haltestelle und Linie **cloud**, solange die PRIM-API antwortet, **unerreichbar**, wenn ihre letzte Abfrage fehlschlug, und wird orange, wenn die Abfragen wegen des Tageskontingents pausieren.

## Szenen

### Auslöser

| Auslöser                        | Wann                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| **IDFM: Zug verspätet**         | ein verfolgter Zug verspätet sich (ab der Schwelle), dann erneut bei 15 und 30 min           |
| **IDFM: Abfahrt fällt aus**     | eine verfolgte Abfahrt fällt aus                                                             |
| **IDFM: Abfahrt in Kürze**      | eine verfolgte Abfahrt erfolgt in 2, 5, 10, 15, 20 oder 30 Minuten, nach der **echten** Zeit |
| **IDFM: Linie gestört**         | eine neue Störung betrifft eine verfolgte Linie (Filter: Schwere, Störung/Bauarbeiten)       |
| **IDFM: Verkehr wieder normal** | eine verfolgte Linie, die gestört war, fährt wieder normal                                   |

Jedes Ereignis liefert eine Variable **Zusammenfassung**, einen Satz, der direkt verschickt werden kann: „Massy - Palaiseau: RER B KASE → Aéroport CDG 2 fährt in 15 min ab, um 07:42 (4 min Verspätung).“ oder „RER B: Unterbrochen. Trafic interrompu entre Massy et Paris.“.

Ein Ereignis löst nur einmal pro Abfahrt oder Störung aus, auch nach einem Neustart.

### Aktionen

- **IDFM: nächste Abfahrten**: die nächste Abfahrt einer Haltestelle (Linie, Ziel, Uhrzeit, Verspätung, Gleis …) und eine Zusammenfassung, zum Beispiel um „meinen nächsten RER anzusagen, wenn ich aus der Dusche komme“.
- **IDFM: Verkehr einer Linie**: der Zustand einer Linie, ihre wichtigste Störung und eine Zusammenfassung.

## Widgets

![Das Widget „IDFM-Abfahrten“ (die nächsten RER B in Massy - Palaiseau, einer verspätet, einer fällt aus) neben dem Widget „IDFM-Verkehr“ (RER B unterbrochen, Bauarbeiten auf Linie 13 geplant) — generierte Illustration, kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-idfm/main/docs/assets/widgets.de.png)

- **IDFM-Abfahrten**: die nächsten Abfahrten einer Haltestelle wie auf den Anzeigetafeln am Bahnhof, mit „N min“, „+N min“, „Fällt aus“ oder „Am Bahnsteig“. Wähle eine verfolgte Haltestelle oder gib eine andere Haltestelle (und ihre Linie) direkt im Widget ein — sie verbraucht dann bei jeder Aktualisierung Kontingent.
- **IDFM-Verkehr**: der Zustand jeder verfolgten Linie (oder der im Widget eingegebenen), dann die aktuellen Störungen und die in den nächsten 24 Stunden geplanten; tippe auf eine, um die ganze Meldung zu lesen.

## Häufige Fragen

**Keine Verspätung bei der Metro?** Die Metro und die meisten Busse haben keinen Fahrplan in den Echtzeitdaten: Nur die Wartezeit ist bekannt. Die Verspätung und der Auslöser „Zug verspätet“ betreffen RER, Transilien und Linien mit Fahrplan.

**Das Widget zeigt „Abfahrten von 07:00-09:30 werden ab 06:00 angezeigt“.** Das ist normal: Außerhalb des Zeitfensters wird die Haltestelle nicht gelesen.

**Gerätenamen oder Zusammenfassungen auf Englisch?** Stelle in den Einstellungen **Sprache der Texte** ein oder öffne einmal ein IDFM-Widget.

**„Der PRIM-API-Schlüssel wird abgelehnt“.** Das Token wurde falsch kopiert oder inzwischen neu erzeugt: Erzeuge ein neues und füge es ein.

**„Tageskontingent erreicht“.** Gib deinen Haltestellen ein Zeitfenster, verlangsame die Aktualisierung oder beantrage bei PRIM ein höheres Kontingent (kostenlos) und trage es in den Einstellungen ein.
