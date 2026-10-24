import 'server-only';
import type { Household } from '@homeward/matching';
import { getTranslations } from 'next-intl/server';
import { OTHER_ANIMALS, UNANSWERED, YES_NO, type CHOICES } from '@/lib/adopter-questions';
import { toFormValues } from '../adopter/adopter-form';

export interface QuestionAndAnswer {
  question: string;
  answer: string;
}

const capitalised = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * An adopter's household answers as they gave them (#42): each question from their profile,
 * worded as they saw it, with their answer. Follow-up questions appear only when they apply.
 */
export async function householdAnswers(household: Household): Promise<QuestionAndAnswer[]> {
  const t = await getTranslations('AdopterProfile');
  const share = await getTranslations('Share');
  const values = toFormValues({ household });
  const yesNo = (value: string) =>
    value === 'yes' ? t('yes') : value === 'no' ? t('no') : share('notAnswered');
  const choice = (field: keyof typeof CHOICES) => {
    const value = values[field]!;
    const key = `${field}${capitalised(value)}`;
    return value !== UNANSWERED && t.has(key as never) ? t(key as never) : share('notAnswered');
  };
  const qa = (question: string, answer: string) => ({ question: t(question as never), answer });

  const answers: QuestionAndAnswer[] = [qa('children', yesNo(values.children!))];
  if (values.children === 'yes' && values.youngestAge) {
    answers.push(qa('youngestAge', values.youngestAge));
  }
  const kinds = OTHER_ANIMALS.filter((kind) => values[`otherAnimal.${kind}`] === 'on');
  answers.push(
    qa(
      'otherAnimals',
      values.otherAnimals === 'none'
        ? t('no')
        : values.otherAnimals === 'some'
          ? kinds.map((kind) => t(`otherAnimal.${kind}`)).join(', ') || t('yes')
          : share('notAnswered'),
    ),
    qa('experience', choice('experience')),
    qa('homeType', choice('homeType')),
    qa('garden', yesNo(values.garden!)),
  );
  if (values.garden === 'yes') answers.push(qa('gardenSecure', yesNo(values.gardenSecure!)));
  answers.push(qa('setting', choice('setting')), qa('stepFree', yesNo(values.stepFree!)));
  answers.push(qa('tenure', choice('tenure')));
  if (values.tenure === 'rent') {
    answers.push(qa('landlordPermission', yesNo(values.landlordPermission!)));
  }
  answers.push(
    qa(
      'hoursAlone',
      values.hoursAlone === UNANSWERED
        ? share('notAnswered')
        : t(`hoursAloneBand.${values.hoursAlone}` as never),
    ),
  );
  for (const key of Object.keys(YES_NO).filter((key) => key !== 'stepFree')) {
    answers.push(qa(key, yesNo(values[key]!)));
  }
  return answers;
}
