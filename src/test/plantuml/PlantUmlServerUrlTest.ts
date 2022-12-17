import PlantUmlServerUrl from '../../main/plantuml/PlantUmlServerUrl';

describe('PlantUMLサイトのURLを作成するテスト', () => {
    describe('generate()のテスト', () => {
        test('指定した「PlantUMLのUML構文」から、サーバに図形を要求するURLを作成できる。', () => {
            const parameter: string = "@startuml\nclass 日本語\n@enduml";

            const actual = new PlantUmlServerUrl(parameter).generate();

            const expected = 'http://www.plantuml.com/plantuml/png/SoWkIImgAStDuKhEIImkLdWsVUcpEMjUh9h7vP2Qbm8K1m00';
            expect(actual).toContain(expected);
        })
    });

    describe('nomarize()のテスト', () => {
        test('両脇のUML宣言があった場合、削除する', () => {
            const parameter: string = "@startuml\nclass 日本語\n@enduml";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual('class 日本語');
        })

        test('前にUML宣言があり、その前にも文字列があった場合、削除する', () => {
            const parameter: string = "前にある不必要と思しき文字列\n@startuml\nclass 日本語";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual('class 日本語');
        })

        test('後ろにUML宣言があり、その後にも文字列があった場合、削除する', () => {
            const parameter: string = "class 日本語@enduml\n後ろにある不必要と思しき文字列";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual('class 日本語');
        })

        test('空白やタブで作られている文字列は、空文字に変換する', () => {
            const parameter: string = " \t \t";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual('');
        })

        test('空白と、前後に改行が連打されていたとしても、空文字に変換する', () => {
            const parameter: string = "\n\n\n  \n\n\n";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual('');
        })

        test('UML宣言に大文字小文字が混在していたとしても、削除する', () => {
            const parameter: string = "前\n@StArTuMl\n\n\nclass Test\n\n@eNdUmL\n後";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual("class Test");
        })

        test('二行以上からなるUMLテキストはそのままとなる', () => {
            const parameter: string = "class Test\nclass Bar";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual("class Test\nclass Bar");
        })

        test('Slack上のコード表現を除去して文字列と認識する', () => {
            const parameter: string = "```class Test {\n  - fielad\n  + method()\n}\nTest -- Parent```";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual("class Test {\n  - fielad\n  + method()\n}\nTest -- Parent");
        })

        test('Slack上で「スペシャルキャラクタに変換されて送られてくる」ものは、復号する', () => {
            const parameter: string = "Figure &lt;|- Rect : 汎化\nRect -|&gt; Parent";

            const actual = new PlantUmlServerUrl(parameter).normalize();

            expect(actual).toEqual("Figure <|- Rect : 汎化\nRect -|> Parent");
        })
    });
});
