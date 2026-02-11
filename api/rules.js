const ALL_POSSIBLE_RULES = {
    pacifist: {
        title: "Pacifist",
        description: "No piece can take any other pieces",
        minTurns: 5,
        maxTurns: 10,
        isInstant: false
    },
    switcheroo: {
        title: "Switcheroo",
        description: "All Bishops and Knights swap places",
        isInstant: true
    },
    communism: {
        title: "Communism",
        description: "Every piece moves like a pawn",
        minTurns: 5,
        maxTurns: 10,
        isInstant: false
    },
    ice_age: {
        title: "Ice Age",
        description: "Columns 1 and 8 are frozen",
        minTurns: 5,
        maxTurns: 10,
        isInstant: false
    },
};

function getRawRules(count) {
    return Object.entries(ALL_POSSIBLE_RULES)
      .map(([id, rule]) => ({ id, ...rule }))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
}

/*
Returns an array of rule objects:
[
    { 
        title: "Pacifist",
        description: "No piece can take any other pieces",
        turnsLeft: 4,
        isInstant: false
    },
    { 
        title: "Switcheroo",
        description: "All Bishops and Knights swap places",
        isInstant: true,
        turnsLeft: 0
    },
    ....
]
*/
export function getNextRules(count = 3) {
    // First grab 3 random rules
    const rawRules = getRawRules(count);
    let newRules = [];
    // Now we calculate the # of turns this rule will actually last for 
    for (const nextRule of rawRules) {
        if (nextRule.isInstant) {
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: true,
                turnsLeft: 0, // unnecessary but just keeping for data consistency
            });
        } else {
            const randomTurns = Math.floor(Math.random() * (nextRule.maxTurns - nextRule.minTurns + 1)) + nextRule.minTurns;
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: false,
                turnsLeft: randomTurns,
            });
        }
    }
    // Now return our list of new rules!
    return newRules;
}

