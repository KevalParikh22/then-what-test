/* Then What?! — base game content (data only).
   Source of every string: "Then What - Base Game Content v1.0.md" (sections in comments below).
   Shape: DRD v1.1 §3.1. Plain JSON-compatible values, no functions, no emoji.
   Do not edit text here without editing the content doc first.
   Checked by js/tests-content.js (run web/content-check.html).

   Notes for the engine and UI:
   - levels: maxRounds, turnSeconds, twistWindows (end-of-round numbers where a Twist may come),
     minTwists / maxTwists per game (DRD §2.3, §5.2).
   - worlds[].fates are in DRD §5.3 order: solved, changed, to-be-continued.
   - builder templates: {list.field} placeholders, filled by engine.buildWorld.
     worldTitleTemplate / questTitleTemplate are the card titles (content doc §4.5).
     questTemplate has no "Quest:" prefix so a built world's quest matches the ready-made
     worlds; the UI adds ui["quest-label"] on the chip (content doc §4.5 note, §11 q18).
   - builder items with levels: ["weaver"] are hidden at Story Sprout (Spooky House).
   - ui values are plain strings with [name] [n] [max] [label] [type] placeholders.
     Plural pairs end in -one / -other. "epilogue-twists" is superseded; do not use it.
   - uiIcons maps a ui key to a <symbol> id in web/icons/icons.svg.
*/
window.ThenWhat = window.ThenWhat || {};
ThenWhat.content = {
  "version": "base-1.0",
  "levels": {
    "sprout": {
      "id": "sprout",
      "name": "Story Sprout",
      "ages": "6–8",
      "maxRounds": 4,
      "turnSeconds": 30,
      "twistWindows": [
        2,
        3
      ],
      "minTwists": 1,
      "maxTwists": 1
    },
    "weaver": {
      "id": "weaver",
      "name": "Tale Weaver",
      "ages": "9–14",
      "maxRounds": 5,
      "turnSeconds": 45,
      "twistWindows": [
        2,
        3,
        4
      ],
      "minTwists": 1,
      "maxTwists": 2
    }
  },
  "worlds": [
    {
      "id": "school-after-the-bell",
      "title": "School After the Bell",
      "kind": "ready-made",
      "worldType": "everyday",
      "icon": "world-school",
      "world": "The school is empty after the last bell. Every room makes a different sound.",
      "questTitle": "Find the hamster",
      "questGoal": "find the hamster",
      "quest": "The class hamster got out! Find it before the school bus leaves.",
      "spark": "Which room do you look in first? What do you hear there?",
      "twists": [
        {
          "id": "school-t1",
          "name": "Tiny Footprints",
          "sprout": "Look! Tiny footprints in the paint. Where do they go?",
          "weaver": "Tiny paint footprints lead away from the art room. Follow them and say where they stop."
        },
        {
          "id": "school-t2",
          "name": "Not the Hamster",
          "sprout": "Someone found a furry friend. But it is not the hamster! Who is it?",
          "weaver": "The caretaker caught something furry in a box, but it isn't the hamster. What is it, and can it help?"
        },
        {
          "id": "school-t3",
          "name": "The Bus Is Early",
          "sprout": "Beep beep! The bus is here early. What is your fast plan?",
          "weaver": "The bus driver honks: the bus is leaving five minutes early. What faster plan does the team try?"
        },
        {
          "id": "school-t4",
          "name": "Squeak in the Piano",
          "sprout": "You hear a squeak in the piano! How do you get it out?",
          "weaver": "A squeak comes from inside the music room piano, but the lid is stuck. How do you open it gently?"
        }
      ],
      "softenTwist": {
        "id": "school-soft",
        "name": "Snack Is Gone",
        "sprout": "The hamster's snack is gone. That means it is close by and safe!",
        "weaver": "The hamster's snack bowl is empty and its bedding is warm. It's close by and safe. Where could it be?"
      },
      "fates": [
        {
          "id": "school-f-solved",
          "type": "solved",
          "sprout": "You find the hamster just in time! Everyone cheers as the bus pulls up.",
          "weaver": "The hamster is safe in its cage just as the bus pulls up, and the whole class cheers for the search team.",
          "closer": "What does the hamster do to say thank you?"
        },
        {
          "id": "school-f-changed",
          "type": "changed",
          "sprout": "The hamster led you to a secret room. It is your new club room!",
          "weaver": "Following the hamster, the team found a forgotten room. It becomes the class's new secret club room.",
          "closer": "What is the first thing you put in the club room?"
        },
        {
          "id": "school-f-continued",
          "type": "to-be-continued",
          "sprout": "The hamster is home. But wait, who left a little map in its cage?",
          "weaver": "The hamster is safe, but it sat on a tiny school map with one room circled. Tomorrow you find out why.",
          "closer": "Which room is circled on the map?"
        }
      ]
    },
    {
      "id": "jungle-explorers",
      "title": "Jungle Explorers",
      "kind": "ready-made",
      "worldType": "real-adventure",
      "icon": "world-jungle",
      "world": "A hot, green jungle. It is full of loud birds, tall trees and a muddy river.",
      "questTitle": "Help the baby elephant",
      "questGoal": "help the baby elephant",
      "quest": "A baby elephant is lost. Help it find its family before dark.",
      "spark": "You push the big leaves away. What do you see first?",
      "twists": [
        {
          "id": "jungle-t1",
          "name": "Big Rain",
          "sprout": "Big rain starts! Find a dry place to wait. What is inside?",
          "weaver": "A sudden rainstorm pours down. The team finds a dry place to wait. What surprise is inside?"
        },
        {
          "id": "jungle-t2",
          "name": "The Bridge Is Gone",
          "sprout": "The rope bridge is gone! How do you get across the river?",
          "weaver": "The rope bridge has washed away. Find a new way across the muddy river, with the baby elephant too."
        },
        {
          "id": "jungle-t3",
          "name": "Monkey Business",
          "sprout": "A monkey grabs your map! It wants to play first. What game?",
          "weaver": "A cheeky monkey grabs the map and climbs high. It will give it back for a trade. What do you offer?"
        },
        {
          "id": "jungle-t4",
          "name": "Two Trumpet Calls",
          "sprout": "You hear a big elephant sound. It comes from two ways! Which way?",
          "weaver": "Two loud trumpet calls echo from two different sides. Which way does the team go, and why?"
        }
      ],
      "softenTwist": {
        "id": "jungle-soft",
        "name": "Parrot Guide",
        "sprout": "A friendly parrot lands on your hat. It knows the way!",
        "weaver": "A friendly parrot lands on someone's hat. It has seen the herd and wants to show the way."
      },
      "fates": [
        {
          "id": "jungle-f-solved",
          "type": "solved",
          "sprout": "The baby elephant runs to its mom. They hug with their trunks!",
          "weaver": "The baby elephant finds its herd at the river. Its mother wraps her trunk around it, and the jungle cheers.",
          "closer": "What sound does the happy herd make?"
        },
        {
          "id": "jungle-f-changed",
          "type": "changed",
          "sprout": "The elephants make you part of the herd. Now you can visit any time!",
          "weaver": "The herd stamps a new path to the river, and the explorers promise to keep this part of the jungle safe.",
          "closer": "What do you name the new path?"
        },
        {
          "id": "jungle-f-continued",
          "type": "to-be-continued",
          "sprout": "The elephants are together again. Then the baby gives you a shiny stone!",
          "weaver": "The family is together, but the baby drops a carved stone pointing deeper into the jungle. The next trip starts at dawn.",
          "closer": "What is drawn on the stone?"
        }
      ]
    },
    {
      "id": "moonlight-market",
      "title": "The Moonlight Market",
      "kind": "ready-made",
      "worldType": "fantasy",
      "icon": "world-lantern",
      "world": "A night market where strange stalls pop up only after sunset.",
      "questTitle": "Find the lantern",
      "questGoal": "find the lantern",
      "quest": "Find the missing lantern before the paths home fade away.",
      "spark": "Which strange stall do you visit first? What is for sale?",
      "attributes": {
        "place": "night market",
        "tension": "time limit",
        "theme": "wonder"
      },
      "twists": [
        {
          "id": "market-t1",
          "name": "Floating Stalls",
          "sprout": "Uh-oh! The stalls float up into the sky! Which one do you catch?",
          "weaver": "One by one, the stalls begin to float upward. Which one must the team catch before it drifts away?"
        },
        {
          "id": "market-t2",
          "name": "The Toy Lantern",
          "sprout": "Surprise! The lantern you found is a toy. The real one is still lost.",
          "weaver": "The lantern the team found is a clever copy. Who made it, and where is the real one hidden?"
        },
        {
          "id": "market-t3",
          "name": "A Silly Price",
          "sprout": "A stall keeper will help. But first you must do a silly dance!",
          "weaver": "A stall keeper offers a shortcut home, but first the team must trade something they really like."
        },
        {
          "id": "market-t4",
          "name": "Talking Cats",
          "sprout": "The market cats start to talk! One knows a secret. What is it?",
          "weaver": "The market cats start talking, and each one tells a different story about the lantern. Which is true?"
        }
      ],
      "softenTwist": {
        "id": "market-soft",
        "name": "Glow Moth",
        "sprout": "A glowing moth flies by and lights up the path. Follow it!",
        "weaver": "A glowing moth flutters past and lights the path for a little while. Where does it lead?"
      },
      "fates": [
        {
          "id": "market-f-solved",
          "type": "solved",
          "sprout": "The lantern shines again! The paths light up, and everyone gets home.",
          "weaver": "The lantern glows at the center of the market again. The paths home light up, and every stall keeper waves goodbye.",
          "closer": "What do the stall keepers give you as a thank-you?"
        },
        {
          "id": "market-f-changed",
          "type": "changed",
          "sprout": "The market loves you! Now it has a new stall just for your team.",
          "weaver": "The market keeps one new stall open for good, run by the team and selling something only they could make.",
          "closer": "What does your new stall sell?"
        },
        {
          "id": "market-f-continued",
          "type": "to-be-continued",
          "sprout": "The lantern is back! Then a new stall pops up with a little door!",
          "weaver": "With the lantern back, a stall nobody has seen before appears. Its little door opens onto somewhere new.",
          "closer": "What do you see through the little door?"
        }
      ]
    }
  ],
  "prompts": [
    {
      "id": "sp-01",
      "text": "Pull something useful out of your pocket. What is it?",
      "category": "object",
      "level": "sprout",
      "stages": ["begin", "middle"],
      "readingGrade": 1.5,
      "source": "P-01"
    },
    {
      "id": "sp-02",
      "text": "You hear a funny sound. What is making it?",
      "category": "sensory",
      "level": "sprout",
      "stages": ["begin", "middle"],
      "readingGrade": 1.0,
      "source": "P-02"
    },
    {
      "id": "sp-03",
      "text": "A little animal says hi! What does it want to show you?",
      "category": "ally",
      "level": "sprout",
      "stages": ["begin", "middle"],
      "readingGrade": 1.5,
      "source": "P-03"
    },
    {
      "id": "sp-04",
      "text": "You find a secret door. Where does it go?",
      "category": "choice",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 1.0,
      "source": "P-04"
    },
    {
      "id": "sp-05",
      "text": "Sniff the air. What do you smell? Is it yummy or yucky?",
      "category": "sensory",
      "level": "sprout",
      "stages": ["begin"],
      "readingGrade": 1.0,
      "source": "P-05"
    },
    {
      "id": "sp-06",
      "text": "Oh no! Something is in the way. What is it?",
      "category": "obstacle",
      "level": "sprout",
      "stages": ["middle", "end"],
      "readingGrade": 1.0,
      "source": "P-06"
    },
    {
      "id": "sp-07",
      "text": "Help a friend do something hard. How do you help?",
      "category": "ally",
      "level": "sprout",
      "stages": ["middle", "end"],
      "readingGrade": 1.0,
      "source": "P-07"
    },
    {
      "id": "sp-08",
      "text": "You find a shiny clue! How does it help the quest?",
      "category": "object",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 1.0,
      "source": "P-08"
    },
    {
      "id": "sp-09",
      "text": "Something silly happens. Everyone laughs! What was it?",
      "category": "consequence",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 2.0,
      "source": "P-09"
    },
    {
      "id": "sp-10",
      "text": "Two paths: one looks safe, one looks strange. Which way?",
      "category": "choice",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 1.0,
      "source": "P-10"
    },
    {
      "id": "sp-11",
      "text": "Give a snack to someone new. What do they say?",
      "category": "ally",
      "level": "sprout",
      "stages": ["begin", "middle"],
      "readingGrade": 1.0,
      "source": "P-11"
    },
    {
      "id": "sp-12",
      "text": "Bring back someone or something from before. What do they do now?",
      "category": "thread-recall",
      "level": "sprout",
      "stages": ["middle", "end"],
      "readingGrade": 1.5,
      "source": "P-15"
    },
    {
      "id": "sp-13",
      "text": "Who do you meet first? How can they help you?",
      "category": "ally",
      "level": "sprout",
      "stages": ["begin"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-14",
      "text": "Why do you want to {quest}? Tell us!",
      "category": "choice",
      "level": "sprout",
      "stages": ["begin"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-15",
      "text": "What happens right after that? Keep the story going!",
      "category": "consequence",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-16",
      "text": "Uh oh! The plan did not work. What do you try now?",
      "category": "obstacle",
      "level": "sprout",
      "stages": ["middle"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-17",
      "text": "You are so close! What is the last thing in the way?",
      "category": "obstacle",
      "level": "sprout",
      "stages": ["end"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-18",
      "text": "Everyone works together now. What does each friend do?",
      "category": "ally",
      "level": "sprout",
      "stages": ["end"],
      "readingGrade": 1.5
    },
    {
      "id": "sp-19",
      "text": "Use something from before to {quest}. What is it?",
      "category": "thread-recall",
      "level": "sprout",
      "stages": ["end"],
      "readingGrade": 1.5
    },
    {
      "id": "sp-20",
      "text": "The Twist changed things! What do you do now?",
      "category": "consequence",
      "level": "sprout",
      "stages": ["twist"],
      "readingGrade": 1.5
    },
    {
      "id": "sp-21",
      "text": "Who helps with the Twist? What do they do?",
      "category": "ally",
      "level": "sprout",
      "stages": ["twist"],
      "readingGrade": 1.0
    },
    {
      "id": "sp-22",
      "text": "Last turn! Try one more time to {quest}!",
      "category": "consequence",
      "level": "sprout",
      "stages": ["final"],
      "readingGrade": 1.5
    },
    {
      "id": "sp-23",
      "text": "Last turn! What is the big last thing everyone does together?",
      "category": "ally",
      "level": "sprout",
      "stages": ["final"],
      "readingGrade": 1.5
    },
    {
      "id": "tw-01",
      "text": "Something surprising happens because of what the last player said. What is it?",
      "category": "consequence",
      "level": "weaver",
      "stages": ["middle", "end"],
      "readingGrade": 4.0,
      "source": "P-13"
    },
    {
      "id": "tw-02",
      "text": "Ask another character to make a hard promise. Do they agree?",
      "category": "ally",
      "level": "weaver",
      "stages": ["middle"],
      "readingGrade": 5.0,
      "source": "P-14"
    },
    {
      "id": "tw-03",
      "text": "Bring back something or someone from earlier in the story and give it a new job.",
      "category": "thread-recall",
      "level": "weaver",
      "stages": ["middle", "end"],
      "readingGrade": 5.0,
      "source": "P-15"
    },
    {
      "id": "tw-04",
      "text": "Reveal a hidden rule of this world that makes the quest harder.",
      "category": "obstacle",
      "level": "weaver",
      "stages": ["begin", "middle"],
      "readingGrade": 5.0,
      "source": "P-16"
    },
    {
      "id": "tw-05",
      "text": "Two characters disagree about what to do next. How do they work it out?",
      "category": "choice",
      "level": "weaver",
      "stages": ["middle"],
      "readingGrade": 3.0,
      "source": "P-17"
    },
    {
      "id": "tw-06",
      "text": "You find a message carved into a wall, a tree or a door. What does it say?",
      "category": "object",
      "level": "weaver",
      "stages": ["begin", "middle"],
      "readingGrade": 3.0,
      "source": "P-18"
    },
    {
      "id": "tw-07",
      "text": "Start a countdown! Something will happen soon, so the team must decide fast.",
      "category": "obstacle",
      "level": "weaver",
      "stages": ["middle", "end"],
      "readingGrade": 3.0,
      "source": "P-19"
    },
    {
      "id": "tw-08",
      "text": "Someone new offers to help, but first they ask for an odd favor. What is it?",
      "category": "ally",
      "level": "weaver",
      "stages": ["begin", "middle"],
      "readingGrade": 3.0,
      "source": "P-20"
    },
    {
      "id": "tw-09",
      "text": "The thing everyone was looking for has been moved. Who moved it, and why?",
      "category": "obstacle",
      "level": "weaver",
      "stages": ["middle"],
      "readingGrade": 3.0,
      "source": "P-21"
    },
    {
      "id": "tw-10",
      "text": "Your character's funny habit or weak spot helps solve a problem. Show how!",
      "category": "ally",
      "level": "weaver",
      "stages": ["middle", "end"],
      "readingGrade": 3.5,
      "source": "P-22"
    },
    {
      "id": "tw-11",
      "text": "The weather changes: rising water, falling snow or wild wind. How does it feel?",
      "category": "sensory",
      "level": "weaver",
      "stages": ["begin", "middle"],
      "readingGrade": 3.0,
      "source": "P-23"
    },
    {
      "id": "tw-12",
      "text": "End your turn on a cliffhanger, so the next player gets to find the way out!",
      "category": "consequence",
      "level": "weaver",
      "stages": ["middle"],
      "readingGrade": 4.5,
      "source": "P-24"
    },
    {
      "id": "tw-13",
      "text": "Describe the first place the team explores. What makes it strange or special?",
      "category": "sensory",
      "level": "weaver",
      "stages": ["begin"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-14",
      "text": "Introduce someone the team meets early on. What do they want, and can they be trusted?",
      "category": "ally",
      "level": "weaver",
      "stages": ["begin"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-15",
      "text": "Why does your character really want to {quest}? Give a secret reason.",
      "category": "choice",
      "level": "weaver",
      "stages": ["begin"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-16",
      "text": "The last plan goes a little wrong. What goes wrong, and what does the team try next?",
      "category": "consequence",
      "level": "weaver",
      "stages": ["middle"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-17",
      "text": "The team is close to the goal, but one last problem blocks the way. What is it?",
      "category": "obstacle",
      "level": "weaver",
      "stages": ["end"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-18",
      "text": "A clue, object or friend from earlier turns out to be the key. How does it help?",
      "category": "thread-recall",
      "level": "weaver",
      "stages": ["end"],
      "readingGrade": 3.5
    },
    {
      "id": "tw-19",
      "text": "A character who has been quiet so far steps up. What brave thing do they do?",
      "category": "ally",
      "level": "weaver",
      "stages": ["end"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-20",
      "text": "The Twist changes the plan. What does the team do now, and who has the idea?",
      "category": "consequence",
      "level": "weaver",
      "stages": ["twist"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-21",
      "text": "Someone is upset about the Twist. Who is it, and how does the team help?",
      "category": "ally",
      "level": "weaver",
      "stages": ["twist"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-22",
      "text": "Final turn! The team makes one last try to {quest}. Tell the big moment.",
      "category": "consequence",
      "level": "weaver",
      "stages": ["final"],
      "readingGrade": 3.0
    },
    {
      "id": "tw-23",
      "text": "Final turn! Bring back one thing from earlier for the big moment. What happens?",
      "category": "thread-recall",
      "level": "weaver",
      "stages": ["final"],
      "readingGrade": 3.0
    }
  ],
  "characters": [
    {
      "id": "ch-inventor",
      "name": "The Curious Inventor",
      "trait": "Builds clever things, but trips over their own feet.",
      "icon": "char-inventor"
    },
    {
      "id": "ch-animal-friend",
      "name": "The Animal Friend",
      "trait": "Can talk with any animal. Always has a snack.",
      "icon": "char-animal-friend"
    },
    {
      "id": "ch-brave-beginner",
      "name": "The Brave Beginner",
      "trait": "A bit scared of new things, but never gives up.",
      "icon": "char-brave-beginner"
    },
    {
      "id": "ch-secret-keeper",
      "name": "The Secret Keeper",
      "trait": "Knows one secret about this place. When will they tell?",
      "icon": "char-secret-keeper"
    },
    {
      "id": "ch-snack-chef",
      "name": "The Snack Chef",
      "trait": "Can cook a yummy snack from anything in their pockets.",
      "icon": "char-snack-chef"
    },
    {
      "id": "ch-map-maker",
      "name": "The Map Maker",
      "trait": "Draws a map of every place, even ones with no name.",
      "icon": "char-map-maker"
    },
    {
      "id": "ch-shortcut-finder",
      "name": "The Shortcut Finder",
      "trait": "Always spots a secret way through.",
      "icon": "char-shortcut-finder"
    },
    {
      "id": "ch-kind-helper",
      "name": "The Kind Helper",
      "trait": "Sees the good in everyone, even grumpy ones.",
      "icon": "char-kind-helper"
    }
  ],
  "builder": {
    "where": [
      {
        "id": "city",
        "label": "City",
        "icon": "where-city",
        "phrase": "A busy city"
      },
      {
        "id": "jungle",
        "label": "Jungle",
        "icon": "where-jungle",
        "phrase": "A hot jungle"
      },
      {
        "id": "desert",
        "label": "Desert",
        "icon": "where-desert",
        "phrase": "A sandy desert"
      },
      {
        "id": "forest",
        "label": "Forest",
        "icon": "where-forest",
        "phrase": "A deep green forest"
      },
      {
        "id": "space",
        "label": "Space",
        "icon": "where-space",
        "phrase": "Outer space"
      },
      {
        "id": "under-the-sea",
        "label": "Under the Sea",
        "icon": "where-under-the-sea",
        "phrase": "Under the sea"
      },
      {
        "id": "school",
        "label": "School",
        "icon": "where-school",
        "phrase": "A school"
      },
      {
        "id": "museum",
        "label": "Museum",
        "icon": "where-museum",
        "phrase": "A museum"
      },
      {
        "id": "circus",
        "label": "Circus",
        "icon": "where-circus",
        "phrase": "A circus"
      },
      {
        "id": "spooky-house",
        "label": "Spooky House",
        "icon": "where-spooky-house",
        "phrase": "A spooky but friendly old house",
        "levels": [
          "weaver"
        ]
      }
    ],
    "when": [
      {
        "id": "long-ago",
        "label": "Long ago",
        "icon": "when-long-ago",
        "phrase": "long ago"
      },
      {
        "id": "today",
        "label": "Today",
        "icon": "when-today",
        "phrase": "today"
      },
      {
        "id": "future",
        "label": "The Future",
        "icon": "when-future",
        "phrase": "in the future"
      }
    ],
    "kind": [
      {
        "id": "adventure",
        "label": "Adventure",
        "icon": "kind-adventure",
        "phrase": "An adventure story."
      },
      {
        "id": "mystery",
        "label": "Mystery",
        "icon": "kind-mystery",
        "phrase": "A mystery story."
      },
      {
        "id": "funny",
        "label": "Funny",
        "icon": "kind-funny",
        "phrase": "A funny story."
      },
      {
        "id": "fairy-tale",
        "label": "Fairy Tale",
        "icon": "kind-fairy-tale",
        "phrase": "A fairy tale."
      },
      {
        "id": "superhero",
        "label": "Superhero",
        "icon": "kind-superhero",
        "phrase": "A superhero story."
      },
      {
        "id": "space-story",
        "label": "Space Story",
        "icon": "kind-space-story",
        "phrase": "A space story."
      }
    ],
    "mission": [
      {
        "id": "find-lost",
        "label": "Find something lost",
        "icon": "quest-find-lost",
        "questTitle": "Lost and found",
      "questGoal": "find the lost thing",
        "questText": "Something special is lost. Find it and bring it back."
      },
      {
        "id": "new-friend",
        "label": "Help a new friend",
        "icon": "quest-new-friend",
        "questTitle": "Welcome, new friend!",
      "questGoal": "help your new friend",
        "questText": "Someone new needs a friend. Help them feel at home."
      },
      {
        "id": "deliver",
        "label": "Deliver something special",
        "icon": "quest-deliver",
        "questTitle": "Get it there safe",
      "questGoal": "deliver it safely",
        "questText": "Something special must get to the right person, safe and on time."
      },
      {
        "id": "solve-mystery",
        "label": "Solve a mystery",
        "icon": "quest-solve-mystery",
        "questTitle": "Find the clues",
      "questGoal": "solve the mystery",
        "questText": "Something strange is going on. Find the clues and solve the mystery."
      },
      {
        "id": "fix-broken",
        "label": "Fix something broken",
        "icon": "quest-fix-broken",
        "questTitle": "Fix it together",
      "questGoal": "fix the broken thing",
        "questText": "Something special is broken. Find a way to fix it together."
      },
      {
        "id": "big-party",
        "label": "Get ready for a big party",
        "icon": "quest-big-party",
        "questTitle": "Party time!",
      "questGoal": "get the party ready",
        "questText": "A big party starts soon! Get everything ready in time."
      }
    ],
    "worldTitleTemplate": "{where.label} · {when.label}",
    "worldTemplate": "{where.phrase} {when.phrase}. {kind.phrase}",
    "questTitleTemplate": "{mission.questTitle}",
    "questTemplate": "{mission.questText}"
  },
  "anyWorld": {
    "twists": [
      {
        "id": "any-t01",
        "name": "The Way Is Blocked",
        "sprout": "Oh no! The way ahead is blocked. Find a new way!",
        "weaver": "The way that looked safe is suddenly blocked. Find a new way around, the sillier the better."
      },
      {
        "id": "any-t02",
        "name": "A Secret Trick",
        "sprout": "Something you carry can do a secret trick! What does it do?",
        "weaver": "Something the team has carried since the start has a hidden power. What happens when it switches on?"
      },
      {
        "id": "any-t03",
        "name": "The Helper Needs Help",
        "sprout": "A helper is stuck! Help them first. Then they can help you.",
        "weaver": "The one person who could help the team is stuck with their own problem. The team must help them first."
      },
      {
        "id": "any-t04",
        "name": "Hurry Up!",
        "sprout": "Hurry! There is less time now. What do you do fast?",
        "weaver": "The deadline just moved closer! The team drops its careful plan and tries something bold. What is it?"
      },
      {
        "id": "any-t05",
        "name": "Upside-Down Rule",
        "sprout": "Silly time! Now one thing here works the wrong way. What is it?",
        "weaver": "One rule of this world flips: maybe fire feels cold, or cats bark. Use it for the next few turns."
      },
      {
        "id": "any-t06",
        "name": "Grumpy Teammate",
        "sprout": "Someone grumpy wants to join your team. How can they help?",
        "weaver": "A grumpy character has to join the team for a bigger job. How do they learn to work together?"
      },
      {
        "id": "any-t07",
        "name": "The Trick Clue",
        "sprout": "Surprise! That clue was a trick. Where is the real clue?",
        "weaver": "The best clue so far was a trick! Who left it, and where is the real one hiding?"
      },
      {
        "id": "any-t08",
        "name": "Wind and Rain",
        "sprout": "Big wind and rain! Go inside somewhere. What do you find?",
        "weaver": "A sudden storm sends everyone inside a place they've never seen. What strange thing is in there?"
      },
      {
        "id": "any-t09",
        "name": "A Note From Tomorrow",
        "sprout": "A paper plane lands. It has a note! What does it say?",
        "weaver": "A paper plane lands with a note from the future: \"Don't open the blue door!\" Does the team listen?"
      },
      {
        "id": "any-t10",
        "name": "The Wrong Door",
        "sprout": "You find a key! But it opens a different door. What is inside?",
        "weaver": "A key turns up, but it opens a hidden hatch in the floor instead of the door. What is down there?"
      },
      {
        "id": "any-t11",
        "name": "One More Thing",
        "sprout": "You are almost done! But wait... there is one more thing to do.",
        "weaver": "The quest is nearly done, but finishing it uncovers a bigger mystery. Name it, and keep the quest going."
      }
    ],
    "softenTwists": [
      {
        "id": "any-soft1",
        "name": "Friendly Guide",
        "sprout": "A friendly animal pops up. It wants to show you the way!",
        "weaver": "A friendly animal pops up and leads the way. Everyone feels a little braver."
      },
      {
        "id": "any-soft2",
        "name": "Under the Rainbow",
        "sprout": "A rainbow comes out. Something nice is under it. What is it?",
        "weaver": "The sky clears and a rainbow appears. Something helpful is waiting at the end of it. What is it?"
      }
    ],
    "fates": [
      {
        "id": "any-f-solved",
        "type": "solved",
        "sprout": "You did it! Everyone has a big happy party for the team.",
        "weaver": "The quest is done! Everyone gathers for a big celebration, and the team gets a thank-you they'll never forget.",
        "closer": "What is the best part of the party?"
      },
      {
        "id": "any-f-changed",
        "type": "changed",
        "sprout": "You are back where you started. But now it looks bright and new!",
        "weaver": "The team ends up back where the story began, but the place has changed because of what they did.",
        "closer": "What looks different now?"
      },
      {
        "id": "any-f-continued",
        "type": "to-be-continued",
        "sprout": "All done! You find a map to a new place. See you next time!",
        "weaver": "The quest is complete, but the last clue is a map to somewhere far away. The next adventure starts tomorrow.",
        "closer": "Where do you think the map goes?"
      }
    ],
    "sparks": [
      "Where are you standing when the story starts? What do you see?",
      "Who is the first person you meet here? What do they say?"
    ]
  },
  "ui": {
    "turn-start": "[name], it's your turn!",
    "pass": "Passing the story to [name]!",
    "timer-done": "Finish your thought, then pass the story.",
    "twist-banner-title": "Uh-oh! A Twist!",
    "twist-banner-guide": "The next turn makes space for this change.",
    "soften-done": "Here's a gentler surprise.",
    "record": "Record",
    "recording": "Recording... Tap Stop when you're done.",
    "auto-stop": "Great telling! That turn is saved.",
    "continue-no-rec": "Continue without recording",
    "mic-blocked": "The microphone is off for this story. Keep telling it out loud!",
    "mic-missing": "No microphone here. You can still tell the story out loud!",
    "told-out-loud": "Told out loud",
    "pause": "Paused. The story will wait for you.",
    "resume": "Welcome back! Your story is right where you left it.",
    "fate-heading": "Then what?! Pick how your story ends.",
    "epilogue-heading": "The End! You told this story together.",
    "epilogue-twists": "Your story got through [n] Twist(s)!",
    "listen": "Listen to your story",
    "delete-audio": "Delete this story's voices and names",
    "delete-confirm": "Delete this story's voices and names from this device? You can't undo this.",
    "delete-all-confirm": "Delete all [n] stories' voices and names from this device? You can't undo this.",
    "last-story": "Your last story is still saved · Listen · Delete",
    "last-stories": "[n] stories are still saved · Listen · Delete all",
    "play-again": "Play another story",
    "level-heading": "Pick a level",
    "level-sprout": "Story Sprout · ages 6–8 · 4 rounds",
    "level-weaver": "Tale Weaver · ages 9–14 · 5 rounds",
    "world-heading": "Pick a world",
    "pick-world": "Pick a world first!",
    "picked": "Picked",
    "spooky-level": "Spooky House is for Tale Weaver. Pick a new place.",
    "players-heading": "How many storytellers?",
    "characters-help": "Everyone gets a story character.",
    "names-toggle": "Add names (optional)",
    "more-settings": "More settings",
    "name-hint": "First name or fun name",
    "names-privacy": "Names stay on this device.",
    "big-screen": "Big screen",
    "start": "Start the story",
    "no-save": "This story can't be saved here. You can still play!",
    "step-of": "Step [n] of 4",
    "back": "Back",
    "use-world": "Use this world",
    "change": "Change",
    "last-story-heading": "Your last story",
    "round-chip": "Round [n] of [max]",
    "keep-going": "Keep going",
    "resume-new": "Start a new story",
    "first-turn": "[name] starts the story!",
    "hand-phone": "Hand the phone to [name].",
    "ready": "I'm ready!",
    "mic-stopped": "The microphone stopped. We kept what we could.",
    "storage-full": "No room left to save voices. Keep telling it out loud!",
    "quest-label": "Quest:",
    "spark-label": "To start:",
    "timer-plenty": "Plenty of time",
    "stop": "Stop",
    "saving": "Saving your turn...",
    "mic-ask-title": "Ask a grown-up for help",
    "mic-ask-text": "The phone will ask to use the microphone. Voices stay on this device. You can delete them at the end.",
    "ok": "OK",
    "not-now": "Not now",
    "round-done": "Round [n] done!",
    "last-round": "Last round! Help the story find its ending.",
    "fate-middle": "Put the phone where everyone can see.",
    "fate-solved": "Problem solved",
    "fate-changed": "World changed",
    "fate-continued": "To be continued",
    "our-pick": "Our pick",
    "fate-confirm": "This is our ending!",
    "turns-told": "[n] turns told",
    "closer-label": "One last question:",
    "album-turn": "Turn [n] · [label]",
    "passed-label": "Passed it on",
    "no-audio-story": "You told this story out loud. No voices were saved.",
    "deleted": "This story's voices and names are deleted.",
    "delete-failed": "The voices could not be deleted. Please try again.",
    "deleted-all": "All saved voices and names are deleted.",
    "play-label": "Play",
    "pause-label": "Pause",
    "next-label": "Next",
    "stop-label": "Stop",
    "delete-title": "Delete the saved voices?",
    "delete": "Delete",
    "keep": "Keep them",
    "tools": "Grown-up tools",
    "pause-session": "Pause",
    "replace-prompt": "Replace prompt",
    "pass-turn": "Pass the story",
    "soften-twist": "Soften Twist",
    "stop-story": "Stop this story",
    "stop-first": "Stop the recording first",
    "secs-left": "[n] seconds left",
    "over-time": "Over time",
    "close": "Close",
    "stop-story-confirm": "Stop this story and go back to the start? Voices told so far stay saved.",
    "stop-story-yes": "Stop the story",
    "keep-playing": "Keep playing",
    "app-title": "Then What?!",
    "setup-heading": "Set up the story",
    "use-characters": "Use characters",
    "player-n": "Player [n]",
    "fewer-players": "One fewer storyteller",
    "more-players": "One more storyteller",
    "players-count": "[n] storytellers",
    "players-min": "2 is the fewest",
    "players-max": "6 is the most",
    "card-style": "Card style",
    "style-lantern": "Lantern storybook",
    "style-collectible": "Collectible card game",
    "style-sticker": "Toy box sticker book",
    "change-world": "Change the built world",
    "last-listen": "Listen to your last story",
    "last-delete": "Delete your last story's voices and names",
    "last-delete-all": "Delete all [n] stories' voices and names",
    "surprise-me": "Surprise me",
    "build-progress": "Your world so far",
    "build-result-heading": "Your world",
    "type-world": "World",
    "type-quest": "Quest",
    "type-prompt": "Prompt",
    "type-twist": "Twist",
    "type-fate": "Ending",
    "turn-order": "Turn order",
    "now-label": "Now",
    "hear-heading": "Hear it",
    "hear-world": "Hear the world",
    "hear-quest": "Hear the quest",
    "hear-step": "Hear the question and choices",
    "hear-pass": "Hear who's next",
    "hear-spark": "Hear the start idea",
    "hear-prompt": "Hear the prompt",
    "hear-twist": "Hear the Twist",
    "hear-fate": "Hear this ending",
    "hear-question": "Hear the question",
    "stop-hearing": "Stop reading",
    "stop-recording": "Stop recording",
    "pick-ending-first": "Pick an ending first",
    "ending-picked": "Picked: [type].",
    "album-heading": "Your story, turn by turn",
    "play-turn": "Play turn [n], [label]",
    "now-playing": "Playing",
    "epilogue-twists-one": "Your story got through 1 Twist!",
    "epilogue-twists-other": "Your story got through [n] Twists!",
    "mic-ask-allow": "Tap Allow on the next message.",
    "build-world": "Build a World",
    "q-where": "Where?",
    "q-when": "When?",
    "q-kind": "What kind of story?",
    "q-quest": "What's the quest?",
    "table-call": "Then what?!",
    "listen-again": "Listen again"
  },
  "uiIcons": {
    "twist-banner-title": "card-twist",
    "record": "ui-mic",
    "continue-no-rec": "ui-continue",
    "pause": "ui-pause",
    "listen": "ui-listen",
    "delete-audio": "ui-delete",
    "level-sprout": "level-sprout",
    "level-weaver": "level-weaver",
    "picked": "ui-check",
    "players-heading": "ui-players",
    "big-screen": "ui-big-screen",
    "back": "ui-back",
    "keep-going": "ui-continue",
    "hand-phone": "ui-phone",
    "quest-label": "card-quest",
    "stop": "ui-stop",
    "mic-ask-title": "ui-tools",
    "our-pick": "ui-check",
    "play-label": "ui-play",
    "pause-label": "ui-pause",
    "next-label": "ui-next-track",
    "stop-label": "ui-stop",
    "delete": "ui-delete",
    "tools": "ui-tools",
    "pause-session": "ui-pause",
    "replace-prompt": "ui-replace",
    "pass-turn": "ui-pass",
    "soften-twist": "ui-soften",
    "stop-story": "ui-stop-story",
    "close": "ui-close",
    "player-n": "ui-person",
    "players-count": "ui-players",
    "last-listen": "ui-listen",
    "last-delete": "ui-delete",
    "surprise-me": "ui-dice",
    "build-result-heading": "card-world",
    "type-world": "card-world",
    "type-quest": "card-quest",
    "type-prompt": "card-prompt",
    "type-twist": "card-twist",
    "type-fate": "card-fate",
    "hear-heading": "ui-read-aloud",
    "hear-world": "ui-read-aloud",
    "hear-quest": "ui-read-aloud",
    "hear-step": "ui-read-aloud",
    "hear-pass": "ui-read-aloud",
    "hear-spark": "ui-read-aloud",
    "hear-prompt": "ui-read-aloud",
    "hear-twist": "ui-read-aloud",
    "hear-fate": "ui-read-aloud",
    "hear-question": "ui-read-aloud",
    "stop-recording": "ui-stop",
    "play-turn": "ui-play",
    "build-world": "card-world",
    "listen-again": "ui-listen",
    "stop-hearing": "ui-read-aloud-stop"
  }
};
