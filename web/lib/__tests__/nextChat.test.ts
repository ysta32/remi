import { describe, expect, it } from 'vitest';
import { checkPhoto, checkQuestion, MAX_PHOTO_BYTES, splitShown, waitingQuestions } from '../nextChat';

describe('splitShown', () => {
  it('shows the first n and counts the rest', () => {
    expect(splitShown([1, 2, 3, 4, 5], 2)).toEqual({ shown: [1, 2], more: 3 });
    expect(splitShown([1], 2)).toEqual({ shown: [1], more: 0 });
  });
});

describe('waitingQuestions', () => {
  it('keeps only questions Remi has not asked yet, oldest first as given', () => {
    const qs = [
      { id: 'a', text: 'A', askedBy: 'Sam', status: 'answered' as const },
      { id: 'b', text: 'B', askedBy: 'Linda', status: 'pending' as const },
      { id: 'c', text: 'C', askedBy: 'Sam', status: 'asked' as const },
    ];
    expect(waitingQuestions(qs).map((q) => q.id)).toEqual(['b']);
  });
});

describe('checkQuestion', () => {
  it('accepts a normal question', () => {
    expect(checkQuestion('What was your first car?', 'Sam')).toBeNull();
  });

  it('asks for a question and a name, and caps the length the API allows', () => {
    expect(checkQuestion('   ', 'Sam')).toBe('Type a question for Hal first.');
    expect(checkQuestion('Hi?', ' ')).toBe('Say who’s asking.');
    expect(checkQuestion('x'.repeat(501), 'Sam')).toBe('Keep it under 500 characters.');
  });
});

describe('checkPhoto', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('accepts JPEG and PNG with a caption', () => {
    expect(checkPhoto(file('car.jpg', 'image/jpeg'), 'Dad with his first car')).toBeNull();
    expect(checkPhoto(file('lake.png', 'image/png'), 'Raystown Lake')).toBeNull();
  });

  it('explains iPhone HEIC photos in plain words', () => {
    expect(checkPhoto(file('IMG_1.HEIC', ''), 'x')).toMatch(/iPhone/);
    expect(checkPhoto(file('a.heif', 'image/heif'), 'x')).toMatch(/JPEG/);
  });

  it('rejects other files, big files and a missing caption', () => {
    expect(checkPhoto(file('a.gif', 'image/gif'), 'x')).toBe('Please choose a JPEG or PNG photo.');
    expect(checkPhoto(file('a.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1), 'x')).toBe('That photo is over 8 MB. Try a smaller one.');
    expect(checkPhoto(file('a.jpg', 'image/jpeg'), '  ')).toBe('Add a short caption so Remi knows what it shows.');
  });
});
