const getRequestPromisified = require("../helpers/promisifications").getRequestPromisified;
const exceptions = require("../helpers/exceptions");
const Exception = exceptions.Exception;

const structure = require("./structure");

// creates a regular expression search pattern that can be used to search words in dictionary
function getSearchPattern(grid, cell, direction) {
    // verify the direction is either H or V
    if (direction !== "H" && direction !== "V") throw new Exception("Invalid direction value on write word");

    let currentRow = cell.row;
    let currentCol = cell.col;
    let pattern = "";

    if (direction === "H") {
        // find the beginning of the word
        while (currentCol > 0 && grid[currentRow][currentCol - 1] !== structure.BlackBox) {
            currentCol--;
        }
        // create pattern. If letter already exist, use that letter, otherwise use the "any word character" pattern (\w)
        while (currentCol < grid[currentRow].length && grid[currentRow][currentCol] !== structure.BlackBox) {
            // while not reached end of word (horizontal)
            pattern += grid[currentRow][currentCol] === null ? "\\w" : grid[currentRow][currentCol];
            currentCol++;
        }
    } else if (direction === "V") {
        // Horizontal
        // find the beginning of the word
        while (currentRow > 0 && grid[currentRow - 1][currentCol] !== structure.BlackBox) {
            currentRow--;
        }
        // create pattern. If letter already exist, use that letter, otherwise use the "any word character" pattern (\w)
        while (currentRow < grid.length && grid[currentRow][currentCol] !== structure.BlackBox) {
            // while not reached end of word (vertical)
            pattern += grid[currentRow][currentCol] === null ? "\\w" : grid[currentRow][currentCol];
            currentRow++;
        }
    } else throw new Exception("Invalid direction value on search pattern");

    return `^${pattern}$`;
}

// finds words matching a specific pattern and retrieves the one in the "skipWords" position (defaults to 0)
function findWord(dictionary, pattern, wordsToAvoid = [], skipWords = 0) {
    const doNotInclude = wordsToAvoid;
    const rePattern = new RegExp(pattern);
    // let possibleWords = dictionary.filter(word => word.length === length && word.startsWith(startsWith));
    const possibleWords = dictionary.filter(word => rePattern.exec(word) && doNotInclude.indexOf(word) < 0); // TODO: this goes through the whole dictionary. Better to use a while.
    let returnValue = null;
    if (possibleWords && skipWords < possibleWords.length) {
        returnValue = possibleWords[skipWords];
    }
    return returnValue;
}

// returns a new crossword with the specified word added to it (both on the grid and on the words array)
function writeWord(crossword, direction, index, word) {
    const newCrossword = JSON.parse(JSON.stringify(crossword));

    // verify the direction is either H or V
    if (direction !== "H" && direction !== "V") throw new Exception("Invalid direction value on write word");

    // verify that word length match
    const currentWord = direction === "H" ? newCrossword.horizontalWords[index] : newCrossword.verticalWords[index];
    if (currentWord.length !== word.length) throw new Exception("Words length do not match");

    let currentRow = currentWord.cell.row;
    let currentCol = currentWord.cell.col;
    // for each square of the puzzle in which the word is being written, check that any previous letter would not be overwritten, then write the corresponding letter of the word received
    for (let i = 0; i < currentWord.length; i++) {
        if (newCrossword.grid[currentRow][currentCol] !== null && newCrossword.grid[currentRow][currentCol] !== word[i])
            throw new Exception("Word would overwrite existing letter: ");
        newCrossword.grid[currentRow][currentCol] = word[i];
        if (direction === "H") currentCol++;
        else currentRow++;
    }

    // set the word on the definitions array
    currentWord.word = word;

    return newCrossword;
}

// returns all words written to the crossword in a single array, searching by horizontal words first and vertical then.
function getUsedWords(crossword) {
    const usedWords = [];
    for (let j = 0; j < 2; j++) {
        const dic = j === 0 ? crossword.horizontalWords : crossword.verticalWords;
        for (let i = 0; i < dic.length; i++) {
            if (dic[i].word !== "") usedWords.push(dic[i].word);
        }
    }
    return usedWords;
}

// Verify if by adding the specified horizontal word we can find vertical words that will fit.
function existVerticalsWithCurrentHorizontal(dictionary, currentCrossword, index) {
    const currentWord = currentCrossword.horizontalWords[index];
    let hasConflict = false;
    let searchPattern = null;
    const currentWords = getUsedWords(currentCrossword);
    for (let i = 0; i < currentWord.length; i++) {
        searchPattern = getSearchPattern(
            currentCrossword.grid,
            { row: currentWord.cell.row, col: currentWord.cell.col + i },
            "V"
        );
        if (
            searchPattern !== "^\\w$" &&
            !/^\^\w\$$/.test(searchPattern) /* single letter pattern is ignored */ &&
            findWord(dictionary, searchPattern, currentWords) === null
        ) {
            hasConflict = true;
            break;
        }
    }
    return !hasConflict;
}

// Fills the next horizontal word by searching the pattern and verifying that there are words in the dictionary to write vertically with the new pattern,
// then calls itself to fill the next word.
// Returns null if no solution with the current state of the crossword.
function fillNextHorizontalWord(crossword, dictionary, index) {
    // const currentCrossword = JSON.parse(JSON.stringify(crossword));

    let potentialNextCrossword = null;
    let nextCrossword = null;
    let potentialWord = "";

    let wordsSkipped = 0;
    const searchPattern = getSearchPattern(crossword.grid, crossword.horizontalWords[index].cell, "H");
    do {
        potentialWord = findWord(dictionary, searchPattern, getUsedWords(crossword), wordsSkipped);
        // TODO: remove potential word from the dictionary
        if (potentialWord !== null) {
            potentialNextCrossword = writeWord(crossword, "H", index, potentialWord);
            if (existVerticalsWithCurrentHorizontal(dictionary, potentialNextCrossword, index)) {
                nextCrossword = writeWord(crossword, "H", index, potentialWord);
                if (index < crossword.horizontalWords.length - 1) {
                    nextCrossword = fillNextHorizontalWord(nextCrossword, dictionary, index + 1);
                }
            }
            wordsSkipped++;
        }
    } while (
        nextCrossword === null && // this word does not allow for the crossword to be completed
        potentialWord !== null
    ); // there are no more words to try with this pattern

    return nextCrossword;
}

// Fills the vertical words once the horizontal words are filled.
function fillVerticalWords(crossword, dictionary) {
    let newCrossword = JSON.parse(JSON.stringify(crossword));
    const currentWords = getUsedWords(newCrossword);
    let searchPattern = null;
    let potentialWord = null;
    for (let i = 0; i < crossword.verticalWords.length; i++) {
        searchPattern = getSearchPattern(crossword.grid, crossword.verticalWords[i].cell, "V");
        potentialWord = findWord(dictionary, searchPattern, currentWords);
        // TODO: remove potential word from the dictionary
        if (potentialWord === null) {
            newCrossword = null;
            break;
        } else {
            newCrossword = writeWord(newCrossword, "V", i, potentialWord);
            currentWords.push(potentialWord);
        }
    }
    return newCrossword;
}

// Returns a fully filled crossword puzzle matching the empty puzzle sent as parameter, using the given dictionary.
// Returns null if not possible to fill the puzzle.
function fillGrid(crossword, dictionary) {
    let filledCrossword = fillNextHorizontalWord(crossword, dictionary, 0);
    if (filledCrossword !== null) {
        filledCrossword = fillVerticalWords(filledCrossword, dictionary);
    }
    return filledCrossword;
}

// Returns a Promise with all words definitions
function getWordsDefinitions(wordArray) {
    const newArray = wordArray.map(elem => Object.assign({}, elem));
    const words = [];
    for (let i = 0; i < newArray.length; i++) {
        words.push(newArray[i].word);
    }
    return Promise.all(words.map(getWordDefinition))
        .then(definitions => {
            for (let i = 0; i < newArray.length; i++) {
                newArray[i].definition = definitions[i];
            }
            //console.log('definitions!', newArray);
            return newArray;
        })
        .catch(err => {
            console.log("error at getWordsDefinitions", err);
            throw err;
        });
}

// Extracts a single random definition of an array of objects
function extractDefinition(definitionObjectArray, word) {
    const defCount = definitionObjectArray.length;
    if (defCount === 0) {
        return word;
    } else {
        const definitionToUse = Math.floor(Math.random() * defCount);
        //console.log('def:', word, definitionObjectArray[ definitionToUse ].text);
        return (definitionObjectArray[definitionToUse].text || word).split(":")[0]; // return original word if no results. remove the text after colon as it usually an example use of the word
    }
}

// Searches an api for a word definition
function getWordDefinition(word) {
    //console.log('word:', word);
    return getRequestPromisified(
        `http://api.wordnik.com:80/v4/word.json/${word.toLowerCase()}/definitions?limit=20&sourceDictionaries=webster&api_key=a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5`
    )
        .then(json => extractDefinition(JSON.parse(json), word))
        .catch(err => {
            console.log("error at getWordDefinition", err);
            throw err;
        });
    /*
    const options = {
        method: 'GET',
        url: `http://api.wordnik.com:80/v4/word.json/${word.toLowerCase()}/definitions`,
        qs: {
            limit: '20',
            sourceDictionaries: 'all',
            api_key: 'a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5'
        },
        qsStringifyOptions: {
            encoding: false
        }
    };
    console.log('ti', options.url);
    request(options, function (error, response, body) {
        if (error) throw new Error(error);
        const definitions = JSON.parse(body);
        //console.log('defs:\n', definitions, '\n', '####');
        const defCount = definitions.length;
        if (defCount === 0) {
            return word;
        }
        else {
            const definitionToUse = Math.floor(Math.random() * defCount);
            //console.log('word:', word, 'defcount:', defCount, definitionToUse, '\ndef2use', definitions[ definitionToUse ].text);
            return definitions[ definitionToUse ].text;
        }
    });
    */
    /*
    fetch(`http://api.wordnik.com:80/v4/word.json/${word}/definitions?limit=20&sourceDictionaries=all&api_key=a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5`)
        .then(response => response.json())
        .then(json => {
            JSON.parse(json);
            console.log('defs:', definitions);
            const defCount = definitions.length;
            if (defCount === 0) {
                return word;
            }
            else {
                const definitionToUse = Math.floor(Math.random() * defCount);
                return definitions[ definitionToUse ].text;
            }
        })
        .catch(err => { console.log('error!', err); throw err });
    */
}

module.exports = {
    findWord,
    writeWord,
    getSearchPattern,
    getUsedWords,
    existVerticalsWithCurrentHorizontal,
    fillNextHorizontalWord,
    fillVerticalWords,
    fillGrid,
    getWordDefinition,
    getWordsDefinitions,
};
