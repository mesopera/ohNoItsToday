import random
import requests

ABSURD_QUOTES = [
    {"text": "Reality is that which, when you stop believing in it, doesn't go away.", "author": "Philip K. Dick"},
    {"text": "Time forks perpetually toward innumerable futures.", "author": "Jorge Luis Borges"},
    {"text": "The cradle rocks above an abyss, and common sense tells us that our existence is but a brief crack of light between two eternities of darkness.", "author": "Vladimir Nabokov"},
    {"text": "In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move.", "author": "Douglas Adams"},
    {"text": "Time is an illusion. Lunchtime doubly so.", "author": "Douglas Adams"},
    {"text": "For a moment, nothing happened. Then, after a second or so, nothing continued to happen.", "author": "Douglas Adams"},
    {"text": "I may not have gone where I intended to go, but I think I have ended up where I needed to be.", "author": "Douglas Adams"},
    {"text": "The fact that we live at the bottom of a deep gravity well on the surface of a gas-covered planet going around a nuclear fireball ninety million miles away, and think this to be normal, is obviously some indication of how skewed our perspective tends to be.", "author": "Douglas Adams"},
    {"text": "When you look long into an abyss, the abyss looks back into you.", "author": "Friedrich Nietzsche"},
    {"text": "Without music, life would be a mistake.", "author": "Friedrich Nietzsche"},
    {"text": "We have art in order not to die of the truth.", "author": "Friedrich Nietzsche"},
    {"text": "I am so clever that sometimes I don't understand a single word of what I am saying.", "author": "Oscar Wilde"},
    {"text": "To live is to suffer, to survive is to find meaning in the suffering.", "author": "Friedrich Nietzsche"},
    {"text": "One must imagine Sisyphus happy.", "author": "Albert Camus"},
    {"text": "In the depth of winter, I finally learned that within me there lay an invincible summer.", "author": "Albert Camus"},
    {"text": "The absurd is born of the confrontation between the human need and the unreasonable silence of the world.", "author": "Albert Camus"},
    {"text": "A book must be the axe for the frozen sea within us.", "author": "Franz Kafka"},
    {"text": "There is infinite hope, but not for us.", "author": "Franz Kafka"},
    {"text": "I am a cage, in search of a bird.", "author": "Franz Kafka"},
    {"text": "In the fight between you and the world, back the world.", "author": "Franz Kafka"},
    {"text": "Once upon a time, I dreamt I was a butterfly. Now I do not know whether I was then a man dreaming I was a butterfly, or whether I am now a butterfly dreaming I am a man.", "author": "Zhuangzi"},
    {"text": "We are a way for the cosmos to know itself.", "author": "Carl Sagan"},
    {"text": "The universe is under no obligation to make sense to you.", "author": "Neil deGrasse Tyson"},
    {"text": "The most incomprehensible thing about the universe is that it is comprehensible.", "author": "Albert Einstein"},
    {"text": "Two things are infinite: the universe and human stupidity; and I'm not sure about the universe.", "author": "Albert Einstein"},
    {"text": "God does not play dice with the universe — but perhaps he plays some other game whose rules we don't know.", "author": "Richard Feynman"},
    {"text": "The universe is not only queerer than we suppose, but queerer than we can suppose.", "author": "J.B.S. Haldane"},
    {"text": "All matter is merely energy condensed to a slow vibration. We are all one consciousness experiencing itself subjectively.", "author": "Bill Hicks"},
    {"text": "Hell is other people.", "author": "Jean-Paul Sartre"},
    {"text": "I rebel; therefore we exist.", "author": "Albert Camus"},
    {"text": "The Tao that can be told is not the eternal Tao.", "author": "Laozi"},
    {"text": "Nature does not hurry, yet everything is accomplished.", "author": "Laozi"},
    {"text": "Do you have the patience to wait until your mud settles and the water is clear?", "author": "Laozi"},
    {"text": "The most beautiful thing we can experience is the mysterious. It is the source of all true art and science.", "author": "Albert Einstein"},
    {"text": "I have approximate answers and possible beliefs and different degrees of certainty about different things, but I'm not absolutely sure of anything.", "author": "Richard Feynman"},
    {"text": "If you realize that all things change, there is nothing you will try to hold on to.", "author": "Laozi"},
    {"text": "So it goes.", "author": "Kurt Vonnegut"},
    {"text": "We are what we pretend to be, so we must be careful about what we pretend to be.", "author": "Kurt Vonnegut"},
    {"text": "Of all the things I've lost, I miss my mind the most.", "author": "Mark Twain"},
    {"text": "There are more things in heaven and earth, Horatio, than are dreamt of in your philosophy.", "author": "William Shakespeare"},
    {"text": "The individual has always had to struggle to keep from being overwhelmed by the tribe.", "author": "Friedrich Nietzsche"},
    {"text": "We shall not cease from exploration, and the end of all our exploring will be to arrive where we started and know the place for the first time.", "author": "T.S. Eliot"},
    {"text": "It is possible to commit no mistakes and still lose. That is not a weakness. That is life.", "author": "Jean-Luc Picard (Patrick Stewart), Star Trek: TNG"},
    {"text": "The border between the Real and the Unreal is not fixed, but just marks the last place where rival gangs of shamans fought each other to a standstill.", "author": "Robert Anton Wilson"},
    {"text": "The map is not the territory.", "author": "Alfred Korzybski"},
    {"text": "Think of how stupid the average person is, and realize half of them are stupider than that.", "author": "George Carlin"},
    {"text": "Sanity is a cozy lie.", "author": "Susan Sontag"},
    {"text": "If the doors of perception were cleansed, everything would appear to man as it is — infinite.", "author": "William Blake"},
    {"text": "There is nothing new under the sun, but there are new suns.", "author": "Octavia Butler"},
    {"text": "The truth is a snare: you cannot have it without being caught. You cannot have the truth in such a way that you catch it, but only in such a way that it catches you.", "author": "Søren Kierkegaard"},
    {"text": "To photograph is to appropriate the thing photographed. It means putting oneself into a certain relation to the world that feels like knowledge — and, therefore, like power.", "author": "Susan Sontag"},
    {"text": "All that we see or seem is but a dream within a dream.", "author": "Edgar Allan Poe"},
    {"text": "The purpose of art is to lay bare the questions that have been hidden by the answers.", "author": "James Baldwin"},
    {"text": "I am not afraid of death, I just don't want to be there when it happens.", "author": "Woody Allen"},
    {"text": "Not everything that can be counted counts, and not everything that counts can be counted.", "author": "William Bruce Cameron"},
    {"text": "The only way to deal with an unfree world is to become so absolutely free that your very existence is an act of rebellion.", "author": "Albert Camus"},
    {"text": "Every word is like an unnecessary stain on silence and nothingness.", "author": "Samuel Beckett"},
    {"text": "I can't go on. I'll go on.", "author": "Samuel Beckett"},
    {"text": "What we call reality is an agreement that people have arrived at to make life more livable.", "author": "Louise Nevelson"},
    {"text": "We're all just walking each other home.", "author": "Ram Dass"},
    {"text": "The moment you doubt whether you can fly, you cease forever to be able to do it.", "author": "J.M. Barrie, Peter Pan"},
    {"text": "Logic will get you from A to B. Imagination will take you everywhere.", "author": "Albert Einstein"},
]


def get_quote() -> dict:
    """
    50/50 chance of a motivational or absurd quote.
    Returns: {text, author, type}
    Falls back to absurd if zenquotes.io is unavailable.
    """
    quote_type = random.choice(['motivational', 'absurd'])

    if quote_type == 'motivational':
        try:
            resp = requests.get('https://zenquotes.io/api/random', timeout=5)
            resp.raise_for_status()
            data = resp.json()[0]
            return {'text': data['q'], 'author': data['a'], 'type': 'motivational'}
        except Exception:
            quote_type = 'absurd'  # Fallback

    quote = random.choice(ABSURD_QUOTES)
    return {'text': quote['text'], 'author': quote['author'], 'type': 'absurd'}
