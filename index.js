const axios = require('axios');
const { JSDOM } = require('jsdom');


const BASE_URL = 'https://www.gokams.or.kr/02_apply/';
const URL_PARAMS = 'introduction.aspx?division=&txtKeyword=&ddlKeyfield=45&page=1';

async function fetchAndParse() {
  try {
    // HTML 요청
    const response = await axios.get(`${BASE_URL}${URL_PARAMS}`);
    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // 게시물 테이블 선택
    const table = document.querySelector('.boardList'); // 실제 클래스명 확인 필요
    const rows = table.querySelectorAll('tbody tr');

    const results = [];

    rows.forEach(row => {
      const columns = row.querySelectorAll('td');
      if (columns.length < 6) return;

      const post = {
        number: columns[0].textContent.trim(),
        status: row.querySelector('img')?.alt || null,
        title: columns[2].textContent.trim(),
        deadline: columns[3].textContent.trim(),
        selectedDate: columns[4].textContent.trim(),
        file: columns[5].textContent.trim(),
        url: `${BASE_URL}/${row.querySelector('a')?.href || null}`
      };

      results.push(post);
    });

    console.log(results);
  } catch (err) {
    console.error('Error fetching data:', err.message);
  }
}

fetchAndParse();
